# Cloudinary Migration Guide

## Why This Migration?

Your background images were being stored on Heroku's ephemeral filesystem, which gets wiped clean every time you deploy or when Heroku restarts your app. This migration moves image storage to Cloudinary, a cloud-based image storage and delivery service.

## Setup Instructions

### 1. Create a Cloudinary Account

1. Go to [cloudinary.com](https://cloudinary.com) and sign up for a free account
2. After signing up, go to your Dashboard
3. Note down these three values from your Dashboard:
   - **Cloud Name**
   - **API Key** 
   - **API Secret**

### 2. Add Environment Variables

Add these three environment variables to your Heroku app:

```bash
# Using Heroku CLI
heroku config:set CLOUDINARY_CLOUD_NAME=your_cloud_name
heroku config:set CLOUDINARY_API_KEY=your_api_key
heroku config:set CLOUDINARY_API_SECRET=your_api_secret
```

Or add them through the Heroku dashboard:
- Go to your app's Settings tab
- Click "Reveal Config Vars"
- Add the three variables

### 3. Environment Variables Needed

```env
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
```

### 4. Deploy the Changes

The migration code has been implemented! Simply deploy your changes:

```bash
git add .
git commit -m "Migrate background images to Cloudinary"
git push heroku master
```

## What Changed?

- ✅ Background images now upload to Cloudinary instead of local filesystem
- ✅ Images are automatically optimized (max 1920x1080, auto quality)
- ✅ Old images are automatically deleted when new ones are uploaded
- ✅ Database schema updated to store Cloudinary public IDs
- ✅ Backward compatibility maintained for existing local images

## Migration Benefits

- 🚀 **Persistent Storage**: Images survive deployments and app restarts
- 📈 **Global CDN**: Faster image loading worldwide
- 🔧 **Automatic Optimization**: Images are compressed and resized automatically
- 💾 **Free Tier**: 25GB storage and 25GB bandwidth/month
- 🛡️ **Reliable**: No more missing background images

## Re-uploading Existing Images

Unfortunately, existing background images stored locally will need to be re-uploaded through the admin interface after deployment. The system will handle everything automatically once you upload them again.

1. Go to your admin panel
2. Navigate to Channel Backgrounds
3. Re-upload any backgrounds that are missing
4. The new images will be stored on Cloudinary permanently

## Troubleshooting

If images don't load after deployment:
1. Check that all three Cloudinary environment variables are set
2. Verify the values are correct (no extra spaces or quotes)
3. Check the app logs for any Cloudinary-related errors
4. Re-upload the background images through the admin interface

## Free Tier Limits

Cloudinary free tier includes:
- 25GB storage
- 25GB monthly bandwidth
- 1000 transformations per month

This should be more than sufficient for background images. 