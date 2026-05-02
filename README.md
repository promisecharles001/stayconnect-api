# StayConnect NG Backend

A production-ready NestJS backend for the StayConnect NG mobile accommodation marketplace app.

## Tech Stack

- **Framework**: NestJS (v10+)
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Authentication**: JWT (Access + Refresh Tokens)
- **Validation**: class-validator & class-transformer
- **Documentation**: Swagger/OpenAPI
- **Security**: Helmet, CORS, Rate Limiting

## Features

### Core Modules

- **Auth Module**: JWT authentication, registration, login, password management
- **Users Module**: User CRUD operations, role management
- **KYC Module**: Identity verification with document upload
- **Properties Module**: Property listing, management, and search
- **Bookings Module**: Booking creation, management, and status tracking
- **Earnings Module**: Host earnings tracking and ledger
- **Withdrawals Module**: Withdrawal requests and processing
- **Admin Module**: Dashboard statistics and admin operations

### User Roles

- `GUEST`: Can search properties and make bookings
- `HOST`: Can list properties and manage bookings
- `ADMIN`: Full system access and management

## Project Structure

```
stayconnect-ng-backend/
├── src/
│   ├── auth/                 # Authentication module
│   │   ├── dto/
│   │   ├── strategies/
│   │   ├── auth.controller.ts
│   │   ├── auth.module.ts
│   │   └── auth.service.ts
│   ├── users/                # Users module
│   ├── kyc/                  # KYC verification module
│   ├── properties/           # Properties module
│   ├── bookings/             # Bookings module
│   ├── earnings/             # Earnings module
│   ├── withdrawals/          # Withdrawals module
│   ├── admin/                # Admin module
│   ├── common/               # Shared utilities
│   │   ├── decorators/
│   │   ├── filters/
│   │   ├── guards/
│   │   ├── pipes/
│   │   └── utils/
│   ├── config/               # Configuration files
│   ├── prisma/               # Prisma service
│   ├── app.module.ts
│   └── main.ts
├── prisma/
│   ├── schema.prisma         # Database schema
│   └── seed.ts               # Database seeding
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd stayconnect-ng-backend
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your database credentials and other settings
```

4. Set up the database:
```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# Seed the database (optional)
npm run prisma:seed
```

5. Start the development server:
```bash
npm run start:dev
```

The API will be available at `http://localhost:3000`
Swagger documentation at `http://localhost:3000/api/docs`

### Default Login Credentials

After running the seed script:

| Role  | Email                    | Password       |
|-------|--------------------------|----------------|
| Admin | admin@stayconnect.ng     | Admin@123456   |
| Host  | host@example.com         | Host@123456    |
| Guest | guest@example.com        | Guest@123456   |

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/refresh` - Refresh access token
- `POST /api/v1/auth/logout` - Logout
- `GET /api/v1/auth/profile` - Get current user profile
- `POST /api/v1/auth/change-password` - Change password
- `POST /api/v1/auth/forgot-password` - Request password reset
- `POST /api/v1/auth/reset-password` - Reset password with token

### Users (Admin only)
- `GET /api/v1/users` - List all users
- `POST /api/v1/users` - Create user
- `GET /api/v1/users/:id` - Get user by ID
- `PATCH /api/v1/users/:id` - Update user
- `DELETE /api/v1/users/:id` - Delete user
- `PATCH /api/v1/users/:id/status` - Update user status
- `PATCH /api/v1/users/:id/role` - Update user role

### KYC
- `POST /api/v1/kyc` - Submit KYC verification
- `GET /api/v1/kyc/my-kyc` - Get current user KYC
- `GET /api/v1/kyc/all` - Get all KYC records (Admin)
- `GET /api/v1/kyc/:id` - Get KYC by ID (Admin)
- `PATCH /api/v1/kyc/:id/review` - Review KYC (Admin)

### Properties
- `GET /api/v1/properties` - List properties (with filters)
- `POST /api/v1/properties` - Create property (Host)
- `GET /api/v1/properties/my-properties` - Get host properties
- `GET /api/v1/properties/:id` - Get property by ID
- `PATCH /api/v1/properties/:id` - Update property
- `DELETE /api/v1/properties/:id` - Delete property
- `PATCH /api/v1/properties/:id/review` - Review property (Admin)

### Bookings
- `POST /api/v1/bookings` - Create booking
- `GET /api/v1/bookings/my-bookings` - Get guest bookings
- `GET /api/v1/bookings/host-bookings` - Get host bookings
- `GET /api/v1/bookings/:id` - Get booking by ID
- `PATCH /api/v1/bookings/:id/status` - Update booking status

### Earnings (Host only)
- `GET /api/v1/earnings/ledger` - Get earnings ledger
- `GET /api/v1/earnings/summary` - Get earnings summary

### Withdrawals (Host only)
- `POST /api/v1/withdrawals` - Create withdrawal request
- `GET /api/v1/withdrawals/my-withdrawals` - Get host withdrawals
- `PATCH /api/v1/withdrawals/:id/cancel` - Cancel withdrawal

### Admin
- `GET /api/v1/admin/dashboard` - Dashboard statistics
- `GET /api/v1/admin/users/stats` - User statistics
- `GET /api/v1/admin/properties/stats` - Property statistics
- `GET /api/v1/admin/bookings/stats` - Booking statistics
- `GET /api/v1/admin/revenue/stats` - Revenue statistics

## Scripts

```bash
# Development
npm run start:dev          # Start with hot reload
npm run start:debug        # Start with debugger

# Production
npm run build              # Build for production
npm run start:prod         # Start production server

# Database
npm run prisma:generate    # Generate Prisma client
npm run prisma:migrate     # Run database migrations
npm run prisma:studio      # Open Prisma Studio
npm run prisma:seed        # Seed database

# Testing
npm run test               # Run unit tests
npm run test:e2e           # Run e2e tests
npm run test:cov           # Generate coverage report

# Code Quality
npm run lint               # Run ESLint
npm run format             # Format code with Prettier
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Server port | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | - |
| `JWT_SECRET` | JWT signing secret | - |
| `JWT_REFRESH_SECRET` | JWT refresh token secret | - |
| `JWT_ACCESS_EXPIRATION` | Access token expiration | `15m` |
| `JWT_REFRESH_EXPIRATION` | Refresh token expiration | `7d` |
| `CORS_ORIGIN` | Allowed CORS origins | - |

## Security Features

- Helmet.js for HTTP security headers
- CORS configuration
- JWT authentication with refresh tokens
- Role-based access control (RBAC)
- Password hashing with bcrypt
- Input validation with class-validator
- Global exception handling

## License

MIT
