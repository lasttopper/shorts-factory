// Simulated source catalog used when no YouTube Data API key is configured.
// Mirrors the shape of real API results so the pipeline is identical either way.
export type SourceVideo = {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  durationSec: number;
  publishedAt: string;
};

export const SIMULATED_CATALOG: SourceVideo[] = [
  { videoId: "nyt_sim_001", title: "5 Streetwear Fits That NEVER Miss", channelTitle: "Not Your Type", thumbnailUrl: "", durationSec: 1180, publishedAt: "2026-01-04T10:00:00Z" },
  { videoId: "nyt_sim_002", title: "Why Baggy Jeans Won 2026", channelTitle: "Not Your Type", thumbnailUrl: "", durationSec: 940, publishedAt: "2026-01-11T10:00:00Z" },
  { videoId: "nyt_sim_003", title: "Sneaker Rotation for Every Season", channelTitle: "Not Your Type", thumbnailUrl: "", durationSec: 1260, publishedAt: "2026-01-18T10:00:00Z" },
  { videoId: "nyt_sim_004", title: "Thrift Haul — 2000 Rupee Challenge", channelTitle: "Not Your Type", thumbnailUrl: "", durationSec: 1490, publishedAt: "2026-01-25T10:00:00Z" },
  { videoId: "nyt_sim_005", title: "How Color Theory Changes Your Whole Fit", channelTitle: "Not Your Type", thumbnailUrl: "", durationSec: 870, publishedAt: "2026-02-01T10:00:00Z" },
  { videoId: "nyt_sim_006", title: "The 3 T-Shirt Rule Every Guy Needs", channelTitle: "Not Your Type", thumbnailUrl: "", durationSec: 760, publishedAt: "2026-02-08T10:00:00Z" },
  { videoId: "nyt_sim_007", title: "Office Fits That Are NOT Boring", channelTitle: "Not Your Type", thumbnailUrl: "", durationSec: 1040, publishedAt: "2026-02-15T10:00:00Z" },
  { videoId: "nyt_sim_008", title: "Layering 101 for Hot Weather", channelTitle: "Not Your Type", thumbnailUrl: "", durationSec: 960, publishedAt: "2026-02-22T10:00:00Z" },
  { videoId: "nyt_sim_009", title: "Budget vs Designer — Can People Even Tell?", channelTitle: "Not Your Type", thumbnailUrl: "", durationSec: 1330, publishedAt: "2026-03-01T10:00:00Z" },
  { videoId: "nyt_sim_010", title: "Grooming Mistakes Quietly Killing Your Style", channelTitle: "Not Your Type", thumbnailUrl: "", durationSec: 890, publishedAt: "2026-03-08T10:00:00Z" },
  { videoId: "nyt_sim_011", title: "Building a Capsule Wardrobe in 10 Pieces", channelTitle: "Not Your Type", thumbnailUrl: "", durationSec: 1540, publishedAt: "2026-03-15T10:00:00Z" },
  { videoId: "nyt_sim_012", title: "Festive Fits Without the Kurta Cliche", channelTitle: "Not Your Type", thumbnailUrl: "", durationSec: 1120, publishedAt: "2026-03-22T10:00:00Z" },
];
