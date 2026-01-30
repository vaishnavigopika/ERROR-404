# BloodConnect - College Blood Donation Management Platform

A comprehensive blood donation management system designed for college communities, enabling seamless connections between blood donors and recipients through intelligent matching and real-time notifications.

## Features

### Core Functionality
- **Blood Type Matching**: Intelligent compatibility matching using blood type compatibility rules
- **Real-Time Notifications**: Instant alerts when compatible donors/recipients are found
- **User Roles**: Support for donors, recipients, and admin accounts
- **Secure Authentication**: Firebase-based authentication with email/password
- **Profile Management**: Comprehensive user profiles with medical history and availability status
- **Messaging System**: Direct communication between donors and recipients
- **Donation Tracking**: History and records of all donations
- **Blood Requests**: Recipients can create urgent blood requests

### Admin Features
- **User Management**: View and manage all platform users
- **Blood Inventory**: Track blood stock levels by type
- **Analytics Dashboard**: Real-time statistics and trends
- **Request Monitoring**: Oversee all blood requests and matches
- **System Reports**: Generate detailed platform reports
- **Settings Management**: Configure platform-wide settings

### Technology Stack
- **Frontend**: Next.js 16, React 19.2, TypeScript
- **Styling**: Tailwind CSS v4, Shadcn UI components
- **Database**: Firebase (Firestore)
- **Authentication**: Firebase Authentication
- **Charting**: Recharts for analytics
- **Icons**: Lucide React

## Getting Started

### Prerequisites
- Node.js 18+
- npm or pnpm
- Firebase project with credentials

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd bloodconnect
```

2. **Install dependencies**
```bash
npm install
# or
pnpm install
```

3. **Configure Firebase**
The Firebase configuration is already included in `/lib/firebase.ts`

4. **Run the development server**
```bash
npm run dev
# or
pnpm dev
```

5. **Open in browser**
Navigate to `http://localhost:3000`

## Project Structure

```
/app
  /auth
    /login - Login page
    /signup - Registration page
  /dashboard
    /page.tsx - Main dashboard
    /donors - Find blood donors
    /requests - Blood requests
    /donations - Donation history
    /profile - User profile
    /messages - Messaging system
    /stats - User statistics
    /settings - User preferences
  /admin
    /page.tsx - Admin dashboard
    /users - User management
    /inventory - Blood inventory
    /requests - Request monitoring
    /analytics - Platform analytics
    /reports - System reports
    /settings - Admin settings
  /onboarding - New user onboarding

/components
  /dashboard - Dashboard components
  /admin - Admin components
  /landing - Landing page components
  /ui - Shadcn UI components

/lib
  /contexts - React contexts (Auth)
  /services - Business logic services
  /types.ts - TypeScript type definitions
  /bloodCompatibility.ts - Blood type compatibility logic
  /firebase.ts - Firebase configuration

/public - Static assets
```

## Key Services

### notificationService
Handles all notification creation and management:
```typescript
await notificationService.createNotification(userId, type, title, message);
notificationService.subscribeToNotifications(userId, callback);
```

### messageService
Manages messaging between users:
```typescript
await messageService.sendMessage(senderId, recipientId, content);
messageService.subscribeToConversation(userId1, userId2, callback);
```

### Blood Compatibility
Smart matching algorithm:
```typescript
canDonate(donorBlood, recipientBlood);
getCompatibleDonors(recipientBlood);
getCompatibleRecipients(donorBlood);
```

## Database Schema

### Users Collection
```typescript
{
  id: string;
  email: string;
  name: string;
  phoneNumber: string;
  bloodType: BloodType;
  role: 'donor' | 'recipient' | 'admin';
  college: string;
  year: string;
  totalDonations: number;
  isAvailable: boolean;
  location: { latitude, longitude, address };
  createdAt: string;
  updatedAt: string;
}
```

### Blood Requests Collection
```typescript
{
  id: string;
  recipientId: string;
  bloodType: BloodType;
  quantity: number;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  reason: string;
  requiredDate: string;
  status: 'open' | 'matched' | 'completed' | 'cancelled';
  matchedDonors: string[];
  createdAt: string;
  updatedAt: string;
}
```

### Donations Collection
```typescript
{
  id: string;
  donorId: string;
  recipientId?: string;
  bloodType: BloodType;
  quantity: number;
  donationDate: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  location: string;
  notes?: string;
  createdAt: string;
}
```

### Messages Collection
```typescript
{
  id: string;
  senderId: string;
  recipientId: string;
  content: string;
  isRead: boolean;
  createdAt: string;
}
```

### Notifications Collection
```typescript
{
  id: string;
  userId: string;
  type: 'match' | 'request' | 'donation' | 'message' | 'system';
  title: string;
  message: string;
  relatedId?: string;
  isRead: boolean;
  createdAt: string;
}
```

## Authentication

The app uses Firebase Authentication with the following flow:

1. **Sign Up**: New users create an account with email/password and select their role
2. **Login**: Users authenticate with credentials
3. **Protected Routes**: Dashboard routes require authentication
4. **Admin Routes**: Admin dashboard requires admin role verification
5. **Sign Out**: Users can sign out from dashboard

## Blood Compatibility Rules

### Universal Donor (O-)
Can donate to all blood types

### Universal Recipient (AB+)
Can receive from all blood types

### Rh Factor
- Rh+ recipients can receive from both Rh+ and Rh-
- Rh- recipients can only receive from Rh-
- Rh+ donors cannot donate to Rh- recipients

## Real-Time Features

The platform uses Firestore's real-time listeners for:
- **Notifications**: Instant alerts when new notifications arrive
- **Messages**: Live messaging between users
- **Request Updates**: Real-time status updates on blood requests

## Admin Capabilities

Admins can:
- View and manage all users
- Monitor blood inventory levels
- Track all blood requests
- Generate system reports
- Configure platform settings
- Access detailed analytics
- Manage system-wide notifications

## Testing

Test credentials can be created through the signup page. Use test emails for testing purposes.

## Development Guidelines

### Code Style
- TypeScript for type safety
- ESLint for code quality
- Tailwind CSS for styling
- Component-based architecture

### Best Practices
- Use React hooks for state management
- Leverage Firestore for real-time updates
- Implement error handling for all Firebase calls
- Validate user input before database operations
- Use semantic HTML for accessibility

## Deployment

### Vercel (Recommended)
```bash
npm run build
vercel deploy
```

### Docker
```bash
docker build -t bloodconnect .
docker run -p 3000:3000 bloodconnect
```

## Environment Variables

The Firebase configuration is hardcoded. For production, move to environment variables:
```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

## Performance Optimization

- **Image Optimization**: Next.js Image component
- **Code Splitting**: Automatic with Next.js
- **Database Indexing**: Firestore indexes for queries
- **Caching**: Service Worker for offline support
- **Lazy Loading**: Components loaded on demand

## Security Considerations

- **Firestore Rules**: RLS policies for data access
- **Authentication**: Secure password hashing via Firebase
- **HTTPS**: Encrypted data in transit
- **Input Validation**: Client and server-side validation
- **XSS Protection**: React's built-in XSS protection

## Troubleshooting

### Common Issues

**Firebase Connection Error**
- Verify Firebase config in `/lib/firebase.ts`
- Check internet connection
- Ensure Firebase project is active

**Authentication Fails**
- Clear browser cache and cookies
- Reset password via Firebase console
- Check email/password are correct

**Real-Time Updates Not Working**
- Verify Firestore rules allow read access
- Check network connectivity
- Ensure subscription cleanup in useEffect

## Future Enhancements

- [ ] SMS notifications integration
- [ ] Mobile app (React Native)
- [ ] Blood bank API integration
- [ ] Machine learning for better matching
- [ ] Video call integration
- [ ] Payment system for blood bank fees
- [ ] Multilingual support
- [ ] Advanced search filters
- [ ] User ratings and reviews
- [ ] Medical professional verification

## Support

For issues and questions, please contact:
- Email: support@bloodconnect.com
- Phone: +1 (555) 123-4567

## License

This project is proprietary software. All rights reserved.

## Contributing

This is a closed-source project. Contributions are not currently accepted.

---

Built with ❤️ for the college community
