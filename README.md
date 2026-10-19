# lastrow

## Store admin portal

The static site includes an admin portal at `admin.html`. It uses Firebase Authentication for email/password sign-in, Cloud Firestore for product/news/photo/topic records, and Firebase Storage for uploaded images. There is no public account-registration form.

### Firebase setup

1. Create a Firebase project, register a Web app, and enable Cloud Firestore and Cloud Storage.
2. In **Authentication → Sign-in method**, enable **Email/Password**. Create the admin account there; the portal does not create accounts.
3. The supplied Firebase Web app configuration is already in `firebase-config.js`. This web config is public client configuration; never put a service-account key or private key in the site.
4. Add the admin email address to `adminEmails` in `firebase-config.js`. In both `firestore.rules` and `storage.rules`, change `isStoreAdmin()` to check for that same verified email using `request.auth != null && request.auth.token.email_verified == true && request.auth.token.email in ['admin@example.com']`. Create a second admin by adding that email to all three allowlists.
5. Publish the contents of `firestore.rules` in **Firestore → Rules** and `storage.rules` in **Storage → Rules**. The rules allow public reads for store content, but only verified allowlisted admins can write. Uploaded images are limited to 8 MB.
6. Verify the admin account's email, then deploy the site. GitHub Pages serves the portal at `/admin.html`.

The portal can add and delete products, publish and delete news, upload and delete gallery photos, and manage news topics. Products and news, photos, and topics added in Firebase are displayed on the public Products and News pages.