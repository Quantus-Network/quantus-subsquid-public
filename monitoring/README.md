# Explorer Monitor

Monitor for subsquid processor - checks if the processor is stalled or lagging and sends alerts to a webhook.

## Requirements

- Docker
- Docker Compose

## Installation and Running

1. Copy the example configuration file:
```bash
cp .env.example .env
```

2. Edit the `.env` file and fill in the environment variables:
   - `METRICS_URL` - URL of the subsquid metrics endpoint
   - `RPC_ENDPOINT_HTTP` - HTTP endpoint of the RPC server
   - `ALERT_WEBHOOK_URL` - Webhook URL for sending alerts

3. Start the monitor:
```bash
docker-compose up -d
```

4. Check logs:
```bash
docker-compose logs -f explorer-monitor
```

## Stopping the Monitor

```bash
docker-compose down
```

## Rebuilding the Image

If you make changes to the code:
```bash
docker-compose up -d --build
```

## Environment Variables

| Variable | Description | Default Value |
|----------|-------------|---------------|
| `METRICS_URL` | URL of the subsquid metrics endpoint | `http://localhost:9090/metrics` |
| `RPC_ENDPOINT_HTTP` | HTTP endpoint of the RPC server | - |
| `MAX_LAG_BLOCKS` | Maximum lag in blocks | `3` |
| `ALERT_WEBHOOK_URL` | Webhook URL for alerts | - |

## How It Works

The monitor checks:
- Whether the subsquid processor is still processing blocks
- Whether the processor is lagging behind the chain height
- Sends alerts when issues are detected

