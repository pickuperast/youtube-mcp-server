# Quota Calculator

The following table shows the quota cost for calling each API method. All API requests, including invalid requests, incur a quota cost of at least one point.

Projects that enable the YouTube Data API have a default quota allocation of 10,000 units per day, an amount sufficient for the majority of our API users. You can see your quota usage on [Quotas](https://console.cloud.google.com/iam-admin/quotas) page in the Google API Console. Daily quotas reset at midnight Pacific Time (PT).

The following two points are worth calling out as they both affect your quota usage:

- If your application calls a method, such as `search.list`, that returns multiple pages of results, each request to retrieve an additional page of results incurs the estimated quota cost.
- [YouTube Live Streaming API](https://developers.google.com/youtube/v3/live) methods are, technically, part of the YouTube Data API, and calls to those methods also incur quota costs. As such, API methods for live streaming are also listed in the table.

| Quota costs |||
|---|---|---|
| resource | method | cost |
| ### activities | list | 1 |
| ### captions | list | 50 |
|   | insert | 400 |
|   | update | 450 |
|   | delete | 50 |
| ### channelBanners | insert | 50 |
| ### channels | list | 1 |
|   | update | 50 |
| ### channelSections | list | 1 |
|   | insert | 50 |
|   | update | 50 |
|   | delete | 50 |
| ### comments | list | 1 |
|   | insert | 50 |
|   | update | 50 |
|   | setModerationStatus | 50 |
|   | delete | 50 |
| ### commentThreads | list | 1 |
|   | insert | 50 |
|   | update | 50 |
| ### guideCategories | list | 1 |
| ### i18nLanguages | list | 1 |
| ### i18nRegions | list | 1 |
| ### members | list | 1 |
| ### membershipsLevels | list | 1 |
| ### playlistItems | list | 1 |
|   | insert | 50 |
|   | update | 50 |
|   | delete | 50 |
| ### playlists | list | 1 |
|   | insert | 50 |
|   | update | 50 |
|   | delete | 50 |
| ### search | list | 100 |
| ### subscriptions | list | 1 |
|   | insert | 50 |
|   | delete | 50 |
| ### thumbnails | set | 50 |
| ### videoAbuseReportReasons | list | 1 |
| ### videoCategories | list | 1 |
| ### videos | list | 1 |
|   | insert | 100 |
|   | update | 50 |
|   | rate | 50 |
|   | getRating | 1 |
|   | reportAbuse | 50 |
|   | delete | 50 |
| ### watermarks | set | 50 |
|   | unset | 50 |