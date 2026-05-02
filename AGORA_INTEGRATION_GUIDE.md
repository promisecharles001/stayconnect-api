# Agora.io Voice Calling Integration - Complete Setup Guide

## Overview
This document provides a complete step-by-step guide to set up Agora.io voice calling functionality in your StayConnect Backend project.

## Current Implementation Status
✅ **Backend Ready**: Token generation service with proper security
✅ **API Endpoints**: RESTful endpoints for token generation
✅ **Security**: User authentication and channel validation
✅ **Frontend Examples**: React Native integration components

## Step 1: Get Agora Credentials

1. Visit [Agora.io Console](https://console.agora.io/)
2. Create an account or sign in
3. Create a new project:
   - **Project Name**: StayConnect NG
   - **Authentication**: App ID + App Certificate
4. Note down your credentials:
   - **App ID**: `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - **App Certificate**: `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

## Step 2: Update Environment Configuration

Update your `.env` file with your actual Agora credentials:

```env
# Agora Voice Calling Configuration
AGORA_APP_ID=your-real-app-id-here
AGORA_APP_CERTIFICATE=your-real-app-certificate-here
AGORA_TOKEN_EXPIRATION=3600
```

## Step 3: Backend API Endpoints

### 1. Check Configuration Status
**Endpoint**: `POST /api/v1/voice/config-status`
**Description**: Verify if Agora credentials are properly configured
**Response**:
```json
{
  "configured": true,
  "appIdConfigured": true,
  "appCertificateConfigured": true,
  "tokenExpiration": 3600
}
```

### 2. Generate Voice Token
**Endpoint**: `POST /api/v1/voice/generate-token`
**Headers**: 
- `Authorization: Bearer YOUR_JWT_TOKEN`
- `Content-Type: application/json`

**Request Body**:
```json
{
  "channelName": "booking-call-123",
  "uid": 12345
}
```

**Response**:
```json
{
  "token": "006xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "channelName": "booking-call-123-12345-a1b2c3d4",
  "uid": 12345,
  "expiresIn": 3600
}
```

## Step 4: Frontend Integration

### React Native Setup

1. **Install Dependencies**:
```bash
npm install react-native-agora
# For iOS
cd ios && pod install
```

2. **Android Permissions** (android/app/src/main/AndroidManifest.xml):
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

3. **iOS Permissions** (ios/YourApp/Info.plist):
```xml
<key>NSMicrophoneUsageDescription</key>
<string>$(PRODUCT_NAME) needs access to your microphone for voice calls.</string>
```

### Voice Service Implementation

The backend provides a complete voice service with:
- Token generation with security validation
- Channel name validation
- User authentication integration
- Proper error handling

### Frontend Component Example

A complete `VoiceCallScreen.tsx` component is provided that includes:
- Call initialization and cleanup
- Mute/unmute functionality
- Speakerphone toggle
- Call timer
- User-friendly UI

## Step 5: Security Features

### Backend Security
-✅ User authentication required for token generation
- ✅ Channel name validation (alphanumeric, 1-64 characters)
- ✅ UID range validation (0-4294967295)
- ✅ Secure channel names with user context
- ✅ Token expiration management

### Token Security
- Tokens are generated per-user with unique channel names
- Automatic expiration after configured time
- UID-based authentication (more secure than account-based)

## Step 6: Testing

### Backend Testing
1. Start your server: `npm run start:dev`
2. Test configuration endpoint:
   ```bash
   curl -X POST http://localhost:3000/api/v1/voice/config-status
   ```
3. Test token generation (requires authentication):
   ```bash
   curl -X POST http://localhost:3000/api/v1/voice/generate-token \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -d '{"channelName": "test-channel", "uid": 12345}'
   ```

### Frontend Testing
1. Implement the provided `VoiceCallScreen` component
2. Test call functionality with real devices
3. Verify audio quality and connection stability

## Step 7: Production Considerations

### Security Best Practices
- Store Agora credentials in secure environment variables
- Use HTTPS in production
- Implement proper rate limiting
- Monitor token usage and API calls

### Performance Optimization
- Configure appropriate token expiration times
- Implement connection retry logic
- Add network quality monitoring
- Consider using Agora's cloud proxy for restricted networks

### Error Handling
- Implement graceful degradation
- Provide user-friendly error messages
- Log errors for debugging
- Handle network interruptions

## Troubleshooting

### Common Issues

1. **Token Generation Fails**
   - Verify Agora App ID and Certificate
   - Check network connectivity
   - Ensure proper authentication headers

2. **Permission Denied**
   - Verify microphone permissions are granted
   - Check device audio settings
   - Test with different devices

3. **Audio Quality Issues**
   - Check network bandwidth
   - Verify device audio settings
   - Test in different network environments

4. **Connection Problems**
   - Verify internet connectivity
   - Check firewall settings
   - Test with Agora's network test tool

## Next Steps

1. Implement the frontend components in your React Native app
2. Test end-to-end functionality with real users
3. Monitor performance and user feedback
4. Consider adding video calling capabilities
5. Implement call recording features (if needed)

## Support Resources

- [Agora.io Documentation](https://docs.agora.io)
- [Agora React Native SDK](https://github.com/AgoraIO-Extensions/agora-react-native-sdk)
- [Agora Community Forums](https://community.agora.io)