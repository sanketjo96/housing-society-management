# Observability — Costing

## Current Scope (Stage 1 + 2): $0/month

| Item | Tool | Tier | Cost | Notes |
|---|---|---|---|---|
| Structured logging | Pino | OSS, self-run | $0 | Runs in your existing process, no external service |
| Log viewing | Hosting provider's log viewer | Included with hosting | $0 | Render/Railway/Fly.io/Vercel all include this on free/hobby tiers |
| Error aggregation | Sentry | Free (Developer) | $0 | Up to 5,000 error events/month, 1 user, 30-day retention |
| Alerting | Sentry → Slack/email | Free | $0 | Included in free tier |

**At 24 flats / 2 personas, realistic error volume is likely tens to low-hundreds of events/month** — nowhere near the 5k/month Sentry free-tier ceiling.

## Engineering Time Cost (one-time)
| Stage | Effort |
|---|---|
| Stage 1 (Pino) | ~3 hours |
| Stage 2 (Sentry) | ~2 hours |
| Docs | ~40 min |

No ongoing maintenance cost expected beyond occasionally reading the Sentry dashboard — there is no infrastructure to patch, scale, or keep alive.

## Cost Triggers to Watch (when this stops being free)
| Signal | What it means | Likely next cost |
|---|---|---|
| Sentry events exceed 5k/month | Real traffic/error volume growing | Sentry Team tier (~$26/mo) *or* self-hosted Sentry/GlitchTip (infra cost instead of subscription) |
| Need >1 Sentry team member with full access | Team growing | Sentry paid tier (per-seat) |
| Hosting log viewer becomes hard to search/retain | Log volume or multi-service growth | Self-hosted Loki (compute + storage cost, likely still low — Loki is cheap by design) |
| Need latency/throughput dashboards | Real performance concerns, not just errors | Self-hosted Grafana + Prometheus (compute cost, no license cost — both OSS) |
| Requests span multiple deployed services | Architecture has grown beyond a monolith | OpenTelemetry + Tempo (compute + storage cost) |

## Cost Philosophy for This App
Given the scale (24 flats, 2 personas), the right budget target is **$0 indefinitely** unless one of the triggers above is actually hit. Any of the deferred tools (Loki/Prometheus/Grafana/OTel) are self-hostable at low cost when needed, but the ops time to run them is the real cost — not licensing. That's the main reason to defer: it's cheaper to occasionally read Sentry than to run a small monitoring cluster for an app this size.

## Rough Future Cost Ranges (for planning only, not needed now)
| Addition | Typical monthly cost if/when adopted |
|---|---|
| Sentry Team tier | ~$26/mo (5 users, 50k events) |
| Self-hosted Loki (small VM) | ~$5–10/mo compute |
| Self-hosted Grafana + Prometheus (small VM) | ~$5–15/mo compute |
| Managed Grafana Cloud (free tier available) | $0 up to generous limits, then usage-based |
