# Quick Reference: Email vs Username

## Separation of Concerns

### Username
- **Purpose**: User identity and login credential
- **Example**: `testuser`, `alice`, `john_doe`
- **Where used**:
  - Login form (primary identifier)
  - Session storage (display name)
  - API responses
  - Audit logs

### Email
- **Purpose**: External communication and account recovery
- **Example**: `testuser@pharmafind.local`, `alice@example.com`
- **Where used**:
  - Registration form (required)
  - Paystack payments (customer ID)
  - Email notifications (future)
  - Password reset (future)
  - Session email field

## Database Schema
```sql
CREATE TABLE User (
  id            STRING PRIMARY KEY,
  username      STRING UNIQUE NOT NULL,      -- User login ID
  email         STRING UNIQUE NOT NULL,      -- External communication
  passwordHash  STRING NOT NULL,
  fullName      STRING,
  phone         STRING,
  role          ROLE DEFAULT USER,
  createdAt     TIMESTAMP DEFAULT NOW(),
  updatedAt     TIMESTAMP DEFAULT NOW()
);
```

## API Contracts

### POST /auth/register
```
Request:
{
  "username": "alice",                    // 3+ chars, alphanumeric only
  "email": "alice@example.com",           // Valid email format
  "password": "MyPass123!",               // 6+ chars, complexity rules
  "fullName": "Alice Johnson",            // 2+ words
  "phone": "+233201234567",               // Optional
  "role": "USER"                          // Optional, defaults to USER
}

Response:
{
  "token": "eyJhbGc...",
  "user": {
    "id": "cmss...",
    "username": "alice",                  // Normalized: alice
    "email": "alice@example.com",         // Normalized: lowercase
    "role": "USER"
  }
}
```

### POST /auth/login
```
Request:
{
  "username": "alice",                    // Can be username OR email
  "password": "MyPass123!"
}

Both work:
- "username": "alice"
- "username": "alice@example.com"

Response:
{
  "token": "eyJhbGc...",
  "user": {
    "id": "cmss...",
    "username": "alice",
    "email": "alice@example.com",         // IMPORTANT: Always returns email
    "role": "USER"
  }
}
```

## Session Storage (Client)
```typescript
// After successful login/register
localStorage.setItem('pharmafind_user', JSON.stringify({
  name: "Alice Johnson",
  email: "alice@example.com",             // Use this for notifications
  role: "USER"
}));
```

## Payment Integration
```typescript
// In /api/payments/initialize
const user = await prisma.user.findUnique({ where: { id: req.user.id } });
const email = user.email;                 // NOT user.username

const paymentInit = await initializePayment(
  email,                                  // email: "alice@example.com"
  amountGhs,
  { reference, deliveryId, userId }
);
```

## Demo Credentials (Login)
All demo accounts can be accessed with EITHER username OR email:

| Identifier | Password |
|-----------|----------|
| testuser | Test123! |
| testuser@pharmafind.local | Test123! |
| campusadmin | Admin123! |
| campusadmin@pharmafind.local | Admin123! |
| pharmacist1 | Pharma123! |
| pharmacist1@pharmafind.local | Pharma123! |
| driver1 | Driver123! |
| driver1@pharmafind.local | Driver123! |

## Common Operations

### Check if user exists
```typescript
// By username
const user = await prisma.user.findUnique({ where: { username: "alice" } });

// By email
const user = await prisma.user.findUnique({ where: { email: "alice@example.com" } });

// By either (for login)
const user = await prisma.user.findFirst({
  where: {
    OR: [
      { username: normalizedInput },
      { email: normalizedInput }
    ]
  }
});
```

### Create user
```typescript
const user = await prisma.user.create({
  data: {
    username: "alice",
    email: "alice@example.com",
    passwordHash: await hashPassword("password"),
    role: "USER"
  }
});
```

### Send email to user
```typescript
// CORRECT ✅
const email = user.email;  // "alice@example.com"

// WRONG ❌
const email = `${user.username}@example.com`;  // "alice@example.com"
// ^ This only works by coincidence, not guaranteed!
```

### Paystack payment
```typescript
// CORRECT ✅
const initialized = await initializePayment(
  user.email,    // "alice@example.com"
  amountGhs,
  metadata
);

// WRONG ❌
const initialized = await initializePayment(
  `${user.username}@example.com`,  // DON'T DO THIS
  amountGhs,
  metadata
);
```

## Login Form Behavior

### Before (Broken)
```
Input field: "Email"
- Only accepted emails
- Rejected usernames
- Used username as fallback (wrong!)
```

### After (Fixed)
```
Input field: "Username or email"
- Accepts both formats
- Normalized to lowercase
- Queries by either field
- Always returns real email in response
```

## Testing Checklist

- [ ] Register with username + email
- [ ] Login with username
- [ ] Login with email
- [ ] Verify session has email (not username)
- [ ] Payment: Check Paystack receives correct email
- [ ] Audit logs: Verify email stored correctly
- [ ] Try to register duplicate username (error)
- [ ] Try to register duplicate email (error)
- [ ] Password validation still works
- [ ] Role assignment works

## Migration Path (for existing users)

### Current Users (before this fix)
If any users exist with only email-based usernames:
```json
{
  "username": "alice@example.com",
  "email": "alice@example.com"
}
```

### Recommended Action
1. **Option A**: Migrate automatically
   - Extract domain from email
   - Set username = local part (alice)
   - Keep email as-is
   - Example: alice@example.com → username: alice, email: alice@example.com

2. **Option B**: Prompt on first login
   - Show: "Please choose a username"
   - Generate default: first part of email
   - Allow customization
   - Update record after confirmation

## Key Points to Remember

1. **Uniqueness**: Both username AND email are unique fields
2. **Normalization**: Both are lowercased before storage
3. **Login Flexibility**: Accept either username or email
4. **Email Guarantee**: Always fetch from `user.email`, never reconstruct
5. **Session**: Store real email in session for notifications
6. **Paystack**: Always use `user.email`, not username

## Troubleshooting

**Problem**: Login shows "Invalid credentials"
- Solution: Check database has email field populated
- Solution: Verify both username and email fields exist
- Solution: Run seed again if needed

**Problem**: Payment fails with wrong email
- Solution: Check if email is fetched from database
- Solution: Don't use username as fallback
- Solution: Verify user record has email field

**Problem**: Email column missing from query
- Solution: Make sure Prisma schema has email field
- Solution: Run `npm run prisma:generate`
- Solution: Rebuild TypeScript types

## Code Comments

Good comments to add:
```typescript
// Fetch user's actual email for external communication
const user = await prisma.user.findUnique({ where: { id: req.user.id } });
const email = user.email;  // Use this, not username

// Allow login by either username or email
const user = await prisma.user.findFirst({
  where: {
    OR: [
      { username: normalizedInput },
      { email: normalizedInput }
    ]
  }
});

// Session should store email for notifications
const session = {
  name: user.username,
  email: user.email,  // Real email for external use
  role: user.role
};
```

---

**Last Updated**: 2026-08-13
**Status**: Production Ready ✅
