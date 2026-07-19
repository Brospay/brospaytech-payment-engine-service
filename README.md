# Valorapays Payment Engine Service

Enterprise-grade Payment Processing Engine with TSP Management and Smart Routing.

## Overview

The Payment Engine Service is the core transaction processing microservice that handles:
- **TSP Integration**: Multiple payment provider integrations (Razorpay, Stripe, PayU, etc.)
- **Smart Routing**: Intelligent transaction routing based on success rates, costs, and availability
- **Fraud Detection**: Real-time fraud analysis and prevention
- **Transaction Management**: End-to-end transaction lifecycle handling
- **Webhook Processing**: Inbound/outbound webhook management

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: NestJS 11
- **Database**: PostgreSQL with TypeORM
- **Cache**: Redis
- **Message Queue**: Kafka
- **Communication**: gRPC, REST, WebSocket
- **Language**: TypeScript

## Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- PostgreSQL 14+
- Redis 6+
- Kafka (optional, for event streaming)

## Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Update .env with your configuration
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | HTTP server port | `5001` |
| `GRPC_PORT` | gRPC server port | `50001` |
| `DATABASE_HOST` | PostgreSQL host | `localhost` |
| `DATABASE_PORT` | PostgreSQL port | `5432` |
| `DATABASE_USERNAME` | Database user | `postgres` |
| `DATABASE_PASSWORD` | Database password | - |
| `DATABASE_NAME` | Database name | `valorapays_engine` |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `KAFKA_BROKERS` | Kafka broker addresses | `localhost:9092` |

## Running the Service

```bash
# Development mode
npm run start:dev

# Production mode
npm run build
npm run start:prod

# Debug mode
npm run start:debug
```

## Database Migrations

```bash
# Generate migration
npm run migration:generate src/migrations/MigrationName

# Run migrations
npm run migration:run

# Revert last migration
npm run migration:revert

# Sync schema (development only)
npm run schema:sync
```

## API Documentation

Swagger documentation is available at:
- Development: `http://localhost:5001/api/docs`

## Key Features

### TSP Integration
Supports multiple Transaction Service Providers:
- Razorpay
- Stripe
- PayU
- Paytm
- Custom TSP adapters

### Smart Routing
- Success rate-based routing
- Cost optimization
- Geographic routing
- Load balancing across TSPs

### Fraud Detection
- Rule-based fraud detection
- Risk scoring
- Velocity checks
- Blacklist management

### Webhook Management
- Inbound webhook processing from TSPs
- Outbound webhook delivery to merchants
- Retry mechanisms with exponential backoff

## Project Structure

```
src/
├── adapters/          # TSP adapters
├── common/            # Shared utilities
├── config/            # Configuration modules
├── dto/               # Data transfer objects
├── entities/          # TypeORM entities
├── fraud/             # Fraud detection module
├── grpc/              # gRPC definitions
├── migrations/        # Database migrations
├── modules/           # Feature modules
├── proto/             # Protobuf definitions
├── tsp/               # TSP management
├── types/             # TypeScript types
├── webhooks/          # Webhook processing
└── main.ts            # Application entry
```

## Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## Health Check

```bash
# HTTP health check
curl http://localhost:5001/health
```

## License

License by WebBuddy LLC

http://brospaytech-payment-engine.ap-south-1.elasticbeanstalk.com/payment/api/v1/health 