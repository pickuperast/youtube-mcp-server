import { withYouTubeClient } from './youtube-client.js';
import { buildChannelUrl, inSubscriberRange, isAfter, isBefore, normalizeChannel } from './channel-metadata.js';
import {
  ChannelParams,
  ChannelSearchParams,
  ChannelsParams,
  ChannelVideosParams,
  CreatorDiscoveryParams,
} from '../types.js';

type EnrichedChannel = any;
const MAX_CHANNEL_IDS_PER_REQUEST = 50;

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

/**
 * Service for interacting with YouTube channels
 */
export class ChannelService {
  private async fetchRawChannels(channelIds: string[], parts = ['snippet', 'statistics', 'contentDetails', 'brandingSettings']) {
    const uniqueChannelIds = Array.from(new Set(channelIds.filter(Boolean)));

    if (uniqueChannelIds.length === 0) {
      return [];
    }

    const batches = chunkArray(uniqueChannelIds, MAX_CHANNEL_IDS_PER_REQUEST);
    const responses = await Promise.all(
      batches.map((batch) =>
        withYouTubeClient((youtube) => youtube.channels.list({
          part: parts,
          id: batch
        }))
      )
    );

    return responses.flatMap((response) => response.data.items || []);
  }

  private async getLatestVideoPublishedAtFromUploadsPlaylist(uploadsPlaylistId: string | undefined): Promise<string | null> {
    if (!uploadsPlaylistId) {
      return null;
    }

    try {
      const response = await withYouTubeClient((youtube) => youtube.playlistItems.list({
        part: ['contentDetails'],
        playlistId: uploadsPlaylistId,
        maxResults: 1,
        fields: 'items/contentDetails/videoPublishedAt'
      }));

      return response.data.items?.[0]?.contentDetails?.videoPublishedAt || null;
    } catch {
      return null;
    }
  }

  private async getLatestVideoPublishedAtMap(rawChannels: any[]) {
    const entries = await Promise.all(
      rawChannels.map(async (channel) => {
        const uploadsPlaylistId = channel?.contentDetails?.relatedPlaylists?.uploads;
        return [channel.id, await this.getLatestVideoPublishedAtFromUploadsPlaylist(uploadsPlaylistId)] as const;
      })
    );

    return Object.fromEntries(entries);
  }

  private filterEnrichedChannels(channels: EnrichedChannel[], filters: {
    minSubscribers?: number;
    maxSubscribers?: number;
    lastUploadAfter?: string;
    lastUploadBefore?: string;
    creatorOnly?: boolean;
  }) {
    return channels.filter((channel) => {
      const metadata = channel.normalizedMetadata || {};

      if (!inSubscriberRange(metadata.subscriberCount || 0, filters.minSubscribers, filters.maxSubscribers)) {
        return false;
      }

      if (!isAfter(channel.latestVideoPublishedAt, filters.lastUploadAfter)) {
        return false;
      }

      if (!isBefore(channel.latestVideoPublishedAt, filters.lastUploadBefore)) {
        return false;
      }

      if (filters.creatorOnly && metadata.channelTypeHeuristic !== 'creator') {
        return false;
      }

      return true;
    });
  }

  private sortEnrichedChannels(channels: EnrichedChannel[], sortBy = 'relevance', searchRankMap?: Record<string, number>) {
    const ranked = [...channels];

    ranked.sort((left, right) => {
      const leftMeta = left.normalizedMetadata || {};
      const rightMeta = right.normalizedMetadata || {};
      const leftRank = searchRankMap?.[left.id] ?? Number.MAX_SAFE_INTEGER;
      const rightRank = searchRankMap?.[right.id] ?? Number.MAX_SAFE_INTEGER;

      switch (sortBy) {
        case 'subscribers_asc':
          return (leftMeta.subscriberCount || 0) - (rightMeta.subscriberCount || 0) || leftRank - rightRank;
        case 'subscribers_desc':
          return (rightMeta.subscriberCount || 0) - (leftMeta.subscriberCount || 0) || leftRank - rightRank;
        case 'recent_activity':
          return new Date(right.latestVideoPublishedAt || 0).getTime() - new Date(left.latestVideoPublishedAt || 0).getTime() || leftRank - rightRank;
        case 'indie_priority':
          return (leftMeta.subscriberCount || 0) - (rightMeta.subscriberCount || 0) || leftRank - rightRank;
        case 'relevance':
        default:
          return leftRank - rightRank;
      }
    });

    return ranked;
  }

  async enrichChannels({
    channelIds,
    includeLatestUpload = true
  }: ChannelsParams): Promise<any[]> {
    try {
      const rawChannels = await this.fetchRawChannels(channelIds);
      const latestMap = includeLatestUpload
        ? await this.getLatestVideoPublishedAtMap(rawChannels)
        : {};

      return rawChannels.map((channel) => normalizeChannel(channel, latestMap[channel.id] || null));
    } catch (error) {
      throw new Error(`Failed to enrich channels: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get channel details
   */
  async getChannel({
    channelId
  }: ChannelParams): Promise<any> {
    const channels = await this.enrichChannels({
      channelIds: [channelId],
      includeLatestUpload: true
    });

    return channels[0] || null;
  }

  /**
   * Get details for multiple channels in one request
   */
  async getChannels({
    channelIds,
    includeLatestUpload = true
  }: ChannelsParams): Promise<any[]> {
    return this.enrichChannels({
      channelIds,
      includeLatestUpload
    });
  }

  /**
   * Search for YouTube channels by handle, name, or query and enrich them
   */
  async searchChannels({
    query,
    maxResults = 5,
    order = 'relevance',
    channelType,
    minSubscribers,
    maxSubscribers,
    lastUploadAfter,
    lastUploadBefore,
    creatorOnly = false,
    sortBy = 'relevance'
  }: ChannelSearchParams): Promise<any[]> {
    try {
      const params: any = {
        part: ['snippet'],
        q: query,
        maxResults,
        order,
        type: ['channel']
      };

      if (channelType) {
        params.channelType = channelType;
      }

      const response = await withYouTubeClient((youtube) => youtube.search.list(params));
      const items = response.data.items || [];
      const searchRankMap = Object.fromEntries(items.map((item, index) => [item.snippet?.channelId, index]));
      const enriched = await this.enrichChannels({
        channelIds: items.map((item) => item.snippet?.channelId).filter(Boolean),
        includeLatestUpload: true
      });
      const filtered = this.filterEnrichedChannels(enriched, {
        minSubscribers,
        maxSubscribers,
        lastUploadAfter,
        lastUploadBefore,
        creatorOnly,
      });

      return this.sortEnrichedChannels(filtered, sortBy, searchRankMap);
    } catch (error) {
      throw new Error(`Failed to search channels: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Discover creator channels from video mentions in one endpoint
   */
  async findCreators({
    query,
    maxResults = 10,
    order = 'relevance',
    videoPublishedAfter,
    videoPublishedBefore,
    channelMinSubscribers,
    channelMaxSubscribers,
    channelLastUploadAfter,
    channelLastUploadBefore,
    creatorOnly = false,
    sortBy = 'relevance',
    sampleVideosPerChannel = 3,
  }: CreatorDiscoveryParams): Promise<any[]> {
    try {
      const searchParams: any = {
        part: ['snippet'],
        q: query,
        maxResults,
        order,
        type: ['video']
      };

      if (videoPublishedAfter) {
        searchParams.publishedAfter = videoPublishedAfter;
      }

      if (videoPublishedBefore) {
        searchParams.publishedBefore = videoPublishedBefore;
      }

      const response = await withYouTubeClient((youtube) => youtube.search.list(searchParams));
      const videos = response.data.items || [];
      const videosByChannel = new Map<string, any[]>();
      const channelOrder = new Map<string, number>();

      for (const [index, item] of videos.entries()) {
        const channelId = item?.snippet?.channelId;
        if (!channelId) {
          continue;
        }

        if (!videosByChannel.has(channelId)) {
          videosByChannel.set(channelId, []);
          channelOrder.set(channelId, index);
        }

        videosByChannel.get(channelId)?.push(item);
      }

      const enriched = await this.enrichChannels({
        channelIds: Array.from(videosByChannel.keys()),
        includeLatestUpload: true
      });
      const filtered = this.filterEnrichedChannels(enriched, {
        minSubscribers: channelMinSubscribers,
        maxSubscribers: channelMaxSubscribers,
        lastUploadAfter: channelLastUploadAfter,
        lastUploadBefore: channelLastUploadBefore,
        creatorOnly,
      });
      const sorted = this.sortEnrichedChannels(filtered, sortBy, Object.fromEntries(channelOrder.entries()));

      return sorted.map((channel) => ({
        ...channel,
        matchedQuery: query,
        matchCount: videosByChannel.get(channel.id)?.length || 0,
        matchedVideos: (videosByChannel.get(channel.id) || []).slice(0, sampleVideosPerChannel).map((item) => ({
          videoId: item.id?.videoId || null,
          title: item.snippet?.title || null,
          description: item.snippet?.description || null,
          publishedAt: item.snippet?.publishedAt || null,
          channelTitle: item.snippet?.channelTitle || null,
        })),
      }));
    } catch (error) {
      throw new Error(`Failed to find creators: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get channel playlists
   */
  async getPlaylists({
    channelId,
    maxResults = 50
  }: ChannelVideosParams): Promise<any[]> {
    try {
      const response = await withYouTubeClient((youtube) => youtube.playlists.list({
        part: ['snippet', 'contentDetails'],
        channelId,
        maxResults
      }));

      return response.data.items || [];
    } catch (error) {
      throw new Error(`Failed to get channel playlists: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get channel videos
   */
  async listVideos({
    channelId,
    maxResults = 50
  }: ChannelVideosParams): Promise<any[]> {
    try {
      const channel = await this.fetchRawChannels([channelId], ['contentDetails']);
      const uploadsPlaylistId = channel[0]?.contentDetails?.relatedPlaylists?.uploads;

      if (!uploadsPlaylistId) {
        return [];
      }

      const response = await withYouTubeClient((youtube) => youtube.playlistItems.list({
        part: ['snippet', 'contentDetails'],
        playlistId: uploadsPlaylistId,
        maxResults,
        fields: 'items(contentDetails/videoId,contentDetails/videoPublishedAt,snippet/title,snippet/description,snippet/publishedAt,snippet/channelId,snippet/channelTitle,snippet/thumbnails)'
      }));

      return (response.data.items || []).map((item) => ({
        id: {
          videoId: item.contentDetails?.videoId || null,
        },
        snippet: item.snippet || null,
        contentDetails: item.contentDetails || null,
      }));
    } catch (error) {
      throw new Error(`Failed to list channel videos: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get channel statistics
   */
  async getStatistics({
    channelId
  }: ChannelParams): Promise<any> {
    try {
      const channel = await this.getChannel({ channelId });
      return channel?.statistics || null;
    } catch (error) {
      throw new Error(`Failed to get channel statistics: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
