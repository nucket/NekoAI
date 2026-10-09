# NekoAI install metrics

Daily snapshots of public GitHub Releases download counts. No telemetry runs in the app.

The data lives on the orphan [`metrics` branch](https://github.com/nucket/NekoAI/tree/metrics), so the nightly bot commits stay out of `main`'s history:

- [Latest totals](https://github.com/nucket/NekoAI/blob/metrics/README.md) (by OS, architecture, version and format)
- [`latest.json`](https://github.com/nucket/NekoAI/blob/metrics/latest.json) and the [`snapshots/`](https://github.com/nucket/NekoAI/tree/metrics/snapshots) history
- Snapshot format: [`SCHEMA.md`](SCHEMA.md)

The collector is [`scripts/metrics/collect.mjs`](../../scripts/metrics/collect.mjs), run by [`.github/workflows/metrics.yml`](../../.github/workflows/metrics.yml). To run it locally:

```sh
GITHUB_TOKEN=$(gh auth token) node scripts/metrics/collect.mjs   # writes ./metrics-data/
```
