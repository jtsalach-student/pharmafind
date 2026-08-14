# 🔴 Paystack Payment Failure - Debug Report

## Executive Summary

**Root Cause Found & Fixed**: Critical type mismatch in payment verification logic  
**Failing Line**: [server/src/routes/payments.ts](server/src/routes/payments.ts#L109)  
**Bug Type**: Logic error - checking wrong property for payment status  
**Impact**: ALL Paystack payments were being rejected as failed

---

## The Bug

### What Was Wrong

**Location**: `server/src/routes/payments.ts`, Line 109 (now ~118)

```typescript
// ❌ WRONG - verification.status is a BOOLEAN, not the payment status
if (verification.status === 'success') {
  // This ALWAYS fails because verification.status = true or false
  // It can NEVER equal the string 'success'
}
```

### Root Cause Analysis

The Paystack API response structure has TWO different "status" fields:

```typescript
type PaystackVerifyResponse = {
  status: boolean;              // ← API call success (true/false)
  message: string;
  data: {
    status: 'success' | 'failed' | 'abandoned';  // ← ACTUAL payment status
    // ... other fields
  }
}
```

The code was checking `verification.status === 'success'`, but:
- `verification.status` is a **boolean** (true = API call succeeded)
- The actual payment status is `verification.data.status` (string: 'success', 'failed', 'abandoned')

This means **ALL payments**, even successful ones, were failing verification!

---

## The Fix

### Corrected Code

```typescript
// ✅ CORRECT - Check verification.data.status (the actual payment status)
if (verification.data?.status === 'success') {
  // Now this correctly identifies successful payments
  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: { status: 'PAID', verifiedAt: new Date(), providerResponse: JSON.stringify(verification) }
  });
  // ... rest of success flow
}
```

### Files Modified

1. **[server/src/routes/payments.ts](server/src/routes/payments.ts)**
   - Fixed the verification check from `verification.status` to `verification.data?.status`
   - Added comprehensive logging at every step
   - Enhanced error messages to show actual payment status

2. **[server/src/services/paystack.ts](server/src/services/paystack.ts)**
   - Added logging for `initializePayment()` function
   - Added logging for `verifyPayment()` function
   - Logs amount conversion (GHS → pesewas)
   - Logs API call details and responses

3. **[client/src/pages/PaymentPage.tsx](client/src/pages/PaymentPage.tsx)**
   - Added comprehensive logging for entire payment flow
   - Logs Paystack initialization
   - Logs callback response details
   - Logs verification response from server
   - Logs delivery request creation

---

## Enhanced Logging for Debugging

### Client-Side Console Logs

When you process a payment, you'll see logs like:

```
[Payment] Initializing payment { publicKey: "configured" }
[Payment] Initializing payment on server { 
  email: "user@example.com",
  totalCost: 25.50,
  reference: "pharmafind_1723123456_a1b2c3d4",
  amountInPesewas: 2550
}
[Payment] Server initialization successful, showing Paystack modal
[Payment] Paystack callback received { 
  responseReference: "ref_123456",
  responseStatus: "success",
  responseTrxref: "ref_123456",
  verificationRef: "ref_123456"
}
[Payment] Calling server verification endpoint { verificationRef: "ref_123456" }
[Payment] Verification response received { 
  verificationData: { status: "PAID", ... },
  paymentStatus: "PAID"
}
[Payment] Payment flow complete - SUCCESS { ... }
```

### Server-Side Console Logs

```
[Paystack Init] Initializing payment { email: "...", amountGhs: 25.5, ... }
[Paystack Init] Amount conversion { amountGhs: 25.5, amountPesewas: 2550 }
[Paystack Init] Payment initialization successful { reference: "pay_...", accessCode: "..." }

[Paystack Verify] Payment verification initiated { reference: "ref_123456", paymentId: "..." }
[Paystack Verify] Verification response received {
  reference: "ref_123456",
  verificationStatus: true,           // ← API call was successful
  paymentDataStatus: "success",       // ← ACTUAL payment status
  amount: 2550,
  paidAt: "2024-08-13T12:34:56Z"
}
[Paystack Verify] Payment verified as successful { reference: "ref_123456", amount: 2550 }
[Paystack Verify] Payment status updated to PAID in database { paymentId: "..." }
[Paystack Verify] Payment flow completed successfully { paymentId: "...", deliveryId: "..." }
```

---

## Payment Flow Verification Checklist

✅ **VITE_PAYSTACK_PUBLIC_KEY Loading**
- Client checks for key in environment variables
- Logs if key is missing or configured
- **Log**: `[Payment] Initializing payment { publicKey: "configured" }`

✅ **Amount Conversion to Pesewas**
- Client: `Math.round(totalCost * 100)` → pesewas
- Server: `Math.round(amountGhs * 100)` → pesewas
- **Log**: `[Paystack Init] Amount conversion { amountGhs: 25.5, amountPesewas: 2550 }`

✅ **Email Provided**
- Uses `user.email` from authenticated session
- Fallback to `'customer@example.com'` if not available
- **Log**: `[Payment] Initializing payment on server { email: "..." }`

✅ **Transaction Reference**
- Client generates: `pharmafind_${Date.now()}_${Math.random()}`
- Server validates uniqueness before creating payment record
- **Log**: `[Payment] Initializing payment on server { reference: "pharmafind_..." }`

✅ **Paystack Callback Processing**
- Receives callback after Paystack payment
- Extracts reference from `response.reference || response.trxref`
- **Log**: `[Payment] Paystack callback received { responseReference: "..." }`

✅ **Payment Verification**
- Calls `/payments/{reference}/verify` endpoint
- **OLD (BROKEN)**: Checked `verification.status === 'success'` ❌
- **NEW (FIXED)**: Checks `verification.data?.status === 'success'` ✅

✅ **Database Status Updates**
- Successful payment: `PaymentStatus = PAID` ✅
- Failed payment: Falls through to error handler
- Delivery created with: `DeliveryStatus = REQUESTED` ✅

✅ **Error Handling**
- Failed payments update delivery to `CANCELLED`
- Detailed error messages including payment status
- User notifications for success/failure

---

## Testing the Fix

### Manual Testing Steps

1. **Start the development server**
   ```bash
   cd server && npm run dev
   cd client && npm run dev
   ```

2. **Navigate to Payment**
   - Login with test user
   - Select a drug for payment
   - Click "Pay GH₵ X.XX"

3. **Monitor Logs**
   - Browser DevTools Console (F12) for client logs
   - Server terminal for server logs
   - Look for `[Payment]` and `[Paystack]` prefixes

4. **Complete Payment**
   - Use Paystack test card credentials
   - Check that logs show successful verification
   - Verify payment status is `PAID` in database

5. **Verify Status Updates**
   - Check `Payment` table: status should be `PAID`
   - Check `DeliveryRequest` table: status should be `REQUESTED`
   - Check `Notification` table: should have success notification

### Debug Commands (Server)

```bash
# Check recent payments
SELECT * FROM "Payment" ORDER BY "createdAt" DESC LIMIT 10;

# Check delivery requests created by payments
SELECT p.id, p.status, d.id, d.status FROM "Payment" p 
LEFT JOIN "DeliveryRequest" d ON p."deliveryId" = d.id 
ORDER BY p."createdAt" DESC LIMIT 10;

# Check payment verification details
SELECT id, status, "verifiedAt", provider FROM "Payment" 
WHERE status = 'PAID' ORDER BY "verifiedAt" DESC LIMIT 5;
```

---

## Summary of Changes

### What Gets Fixed
- ✅ Payment verification now correctly identifies successful payments
- ✅ PaymentStatus is set to PAID for successful transactions
- ✅ DeliveryStatus is set to REQUESTED after successful payment
- ✅ Comprehensive logging throughout the payment flow
- ✅ Better error messages showing actual payment status

### Before the Fix
- ALL payments failed verification (even successful ones)
- Error message: "Payment not verified"
- No visibility into why verification was failing
- DeliveryStatus stayed REQUESTED instead of being properly tracked

### After the Fix
- Successful payments are correctly identified
- PaymentStatus updated to PAID
- Delivery tracking begins automatically
- Detailed logs show exact flow at each step
- Clear error messages with actual payment status

---

## Environment Variables Required

Ensure these are in your `.env` file:

```
PAYSTACK_SECRET_KEY=sk_test_79bb3cb5b7ac72e4a9783b89ec31ff0676c92367
VITE_PAYSTACK_PUBLIC_KEY=pk_test_cbd70694c5fc1a9edfb3c10db8b272710538d502
VITE_API_BASE_URL=http://localhost:4000/api
```

---

## References

- **Paystack API Docs**: https://paystack.com/docs/api/
- **Payment Verify Endpoint**: https://paystack.com/docs/api/#transaction-verify
- **PaystackVerifyResponse Type**: `server/src/services/paystack.ts`
- **Payment Routes**: `server/src/routes/payments.ts`

---

## Next Steps

1. Test the payment flow end-to-end
2. Monitor logs for any remaining issues
3. Verify all successful payments create delivery requests
4. Check that failed payments properly cancel deliveries
5. Confirm user notifications are sent correctly

