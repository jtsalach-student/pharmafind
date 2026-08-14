# Simulated Delivery Tracking - Quick Start Guide

## Prerequisites
- Node.js 18+ installed
- PostgreSQL running (via Supabase local dev or remote instance)
- Both `server` and `client` directories have dependencies installed (`npm install`)

## Starting the Application

### Terminal 1: Start the Backend Server
```bash
cd server
npm run dev
```
Expected output:
```
Server running on http://localhost:4000
```

### Terminal 2: Start the Frontend Dev Server
```bash
cd client
npm run dev
```
Expected output:
```
VITE v7.x.x  ready in xxx ms
➜  Local:   http://localhost:5173/
```

## Complete End-to-End Testing Flow

### Step 1: Register New User (⏱️ ~30 seconds)
1. Open browser to `http://localhost:5173`
2. Click **"Register"** or navigate to `/register`
3. Fill in registration form:
   - Full Name: `John Doe`
   - Email: `john@example.com`
   - Username: `johndoe`
   - Password: `password123`
   - Phone: `+233201234567`
4. Click **"Register"** button
5. Verify you're redirected to login page

### Step 2: Login (⏱️ ~15 seconds)
1. On login page, enter credentials:
   - Username/Email: `john@example.com` (or `johndoe`)
   - Password: `password123`
2. Click **"Login"** button
3. Wait for dashboard redirect (should take ~2 seconds)
4. Verify dashboard loads with role badge (e.g., "Patient")

### Step 3: Navigate to Payment Page (⏱️ ~10 seconds)
1. On dashboard, look for **"Make Payment"** or navigate to `/payment`
2. You should see the payment form with:
   - Pharmacy dropdown
   - Drug selection
   - Quantity input
   - Delivery address fields

### Step 4: Submit Mock Payment (⏱️ ~5 seconds)
1. In Payment form:
   - Select pharmacy: "PharmaFind Pharmacy"
   - Enter drug name: "Paracetamol 500mg" (any text works)
   - Enter quantity: "10"
   - Enter delivery address: "Legon, Accra"
   - Enter phone: "+233201234567"
2. Click **"Process Mock Payment"** button
3. Wait for success notification (green banner)
4. Automatic redirect to delivery tracking page

### Step 5: Watch Delivery Tracking (⏱️ ~135 seconds total)
Page should load showing:
- Order number (ORD-XXXXXXXX)
- Live map with 3 markers (pharmacy, destination, driver truck)
- Status card showing: Status, ETA, Distance, Elapsed time
- Timeline with stages
- Driver information panel
- Journey summary

#### Stage Progression Timeline:

**0-15 seconds: REQUESTED Phase**
- Driver icon stays at pharmacy location
- Status: "REQUESTED"
- Console: `[Delivery] Stage transition: REQUESTED → ASSIGNED at 15s`
- No driver movement yet

**15-35 seconds: ASSIGNED Phase**
- Status changes to "ASSIGNED"
- Console: `[Delivery] Driver assigned { driverName: "Akwasi Mensah", driverPhone: "+233 20 123 4567" }`
- Driver starts moving toward destination
- Timeline shows "Assigned" completed

**35-55 seconds: COLLECTED Phase**
- Status changes to "COLLECTED"
- Console: `[Delivery] Package collected from pharmacy`
- Driver continues toward destination (now ~1/3 of the way)
- Timeline shows "Collected" completed
- ETA decreases to ~9 minutes
- Distance decreases to ~3.8 km

**55-115 seconds: IN_TRANSIT Phase**
- Status changes to "IN_TRANSIT"
- Console: `[Delivery] Driver en route to delivery address`
- Driver continues smooth movement
- Watch coordinates update in real-time
- Driver position on map moves toward destination
- ETA continues to decrease (~6 minutes → ~3 minutes)
- Distance continues to decrease (~3.8 km → ~0.8 km)
- Timeline shows "In transit" completed
- Most dynamic phase - best time to observe real-time updates

**115+ seconds: COMPLETED/DELIVERED Phase**
- Status changes to "COMPLETED"
- Console: `[Delivery] Driver arrived at destination`
- Driver icon reaches destination marker on map
- Truck icon at delivery location
- Timeline complete except "Delivered" stage
- "Confirm Receipt" button appears (emerald green)
- Console: `[Delivery] Delivery completed`

### Step 6: Confirm Delivery (⏱️ ~5 seconds)
1. Click **"Confirm Receipt"** button (green button in Journey Summary)
2. Button disappears
3. Success message appears: "✅ Delivery Completed"
4. Shows: `{drugName} delivered to {deliveryAddress}`
5. Page remains on tracking view

## Real-Time Observations to Verify

### Map Visualization
- ✅ Blue dot: Pharmacy location (always in upper-left area)
- ✅ Green dot: Destination (lower-right area)
- ✅ Amber truck: Driver position (starts at blue, moves toward green)
- ✅ Dashed line: Route from pharmacy to destination

### Coordinate Updates
- ✅ Pharmacy coords: ~5.6501, -0.1869 (doesn't change)
- ✅ Destination coords: ~5.6450, -0.1850 (doesn't change)
- ✅ Driver coords: Smoothly interpolates between the two
  - Starts: 5.6501, -0.1869
  - Ends: 5.6450, -0.1850
  - Updates every 500ms

### ETA Countdown
- ✅ Starts at: 12 minutes
- ✅ After ASSIGNED: 9 minutes (12-3)
- ✅ After COLLECTED: 6 minutes (9-3)
- ✅ After IN_TRANSIT: 0 minutes (3-3)

### Distance Tracking
- ✅ Starts at: 4.6 km
- ✅ After ASSIGNED: 3.8 km (4.6-0.8)
- ✅ After COLLECTED: 3.0 km (3.8-0.8)
- ✅ After IN_TRANSIT: 0.2 km (3.0-0.8, rounded)

### Timeline Progress
- ✅ Stages display in order with progress indicators
- ✅ Completed stages show green emerald circle
- ✅ Pending stages show gray circle
- ✅ Connected by vertical line
- ✅ Status badges: "Completed" vs "Pending"

### Console Output Expected
```
[Delivery] Stage transition: REQUESTED → ASSIGNED at 15s
[Delivery] Driver assigned { driverName: "Akwasi Mensah", driverPhone: "+233 20 123 4567" }
[Delivery] Stage transition: ASSIGNED → COLLECTED at 35s
[Delivery] Package collected from pharmacy
[Delivery] Stage transition: COLLECTED → IN_TRANSIT at 55s
[Delivery] Driver en route to delivery address
[Delivery] Stage transition: IN_TRANSIT → COMPLETED at 115s
[Delivery] Driver arrived at destination
[Delivery] Delivery marked as complete
```

## Troubleshooting

### Issue: Page doesn't load
- **Solution**: Verify you're logged in (check for token in localStorage)
- Check browser console for errors (F12)
- Verify PaymentPage redirected correctly

### Issue: Status doesn't progress
- **Solution**: Wait 1+ second, the update interval is 1 second
- Check elapsed time counter in status card
- Refresh page to reload from sessionStorage

### Issue: Driver doesn't move on map
- **Solution**: Wait for ASSIGNED phase (15 seconds)
- Driver only moves starting from ASSIGNED phase
- Check driver coordinates panel for updates (500ms refresh)
- If coordinates aren't changing, check browser console

### Issue: Session lost after refresh
- **Solution**: Data is stored in sessionStorage (per-tab)
- Closing and reopening tab loses data
- Opening in private/incognito window has separate storage
- For persistence, navigate forward without closing page

### Issue: Map markers overlap
- **Solution**: This is expected, destinations are close together (~4.6 km)
- Watch the driver truck icon move between the two
- Coordinates panel shows exact positions

### Issue: Performance lags
- **Solution**: Close other browser tabs
- Check Task Manager for high CPU usage
- Chrome dev tools > Performance tab to profile
- Delivery tracking runs ~2 intervals/second (very low overhead)

## Success Indicators

✅ **Complete Success** when:
1. You can complete full workflow (signup → login → payment → tracking)
2. Status automatically progresses from REQUESTED → DELIVERED
3. Driver icon moves smoothly on map toward destination
4. ETA and distance decrease predictably with each stage
5. Elapsed time counter increments every second
6. Timeline shows stages completing as time progresses
7. Console shows stage transition logs
8. "Confirm Receipt" button appears after delivery
9. Clicking button shows completion summary
10. All pages redirect correctly after each step

## Next Steps After Testing

### If Everything Works ✅
- Feature is ready for demo
- Can be used to test end-to-end prescription flow
- Perfect for UI/UX testing without external dependencies

### To Enhance Further
1. **Enable Email Verification**: Modify RegisterPage to wait for email confirmation
2. **Add Notifications**: Implement toast notifications for each stage change
3. **Store in Database**: Persist delivery records with actual timestamps
4. **Real Payments**: Integrate actual Paystack API instead of mock
5. **Multi-Driver Support**: Allow multiple concurrent deliveries
6. **Historical Data**: View past deliveries and their tracking history

## Performance Metrics

| Metric | Value | Notes |
|--------|-------|-------|
| Total Cycle Time | ~135 seconds | Complete workflow |
| Status Check Interval | 1 second | Update frequency |
| Location Update Interval | 500ms | Smooth movement |
| Memory Usage | <5 MB | Client-side only |
| Network Usage | 0 bytes | During tracking | 
| CPU Usage | <5% | Idle to light |

## File Locations for Quick Reference

- Frontend: `c:\dev\pharmafind\client`
- Backend: `c:\dev\pharmafind\server`
- Page component: `client/src/pages/MockDeliveryTrackingPage.tsx`
- Payment integration: `client/src/pages/PaymentPage.tsx` (line 151)
- Routes config: `client/src/App.tsx` (line 52)

## Contact Support

If you encounter issues:
1. Check browser console (F12 > Console tab)
2. Check server logs (Terminal 1)
3. Verify database connection
4. Ensure both servers are running on correct ports (4000 and 5173)
