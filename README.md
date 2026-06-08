# CanFrame (Image to Frame)

CanFrame is a powerful Canva App that magically converts transparent PNG mockups, polaroids, and UI frames into native, drag-and-drop Canva Frames. No more manual masking required! 

Simply upload an image with a transparent "hole", and the app uses a custom flood-fill and SVG tracing algorithm to instantly turn that transparent area into an interactive Canva Frame that you can drop photos into.

## Project Structure

This repository contains two main parts:

1. **`Image to Frame/`** - The core Canva App built using React and the Canva Apps SDK.
2. **`Landing Page/`** - A modern, static website fulfilling Canva's App Directory requirements (Landing Page, Terms & Conditions, Privacy Policy, Support).

## How to Run Locally

### 1. The Canva App
To run the Canva App locally, navigate to the app directory and start the development server:

```bash
cd "Image to Frame"
npm install
npm run start
```
The app will run on `http://localhost:8080`. You can then open your Canva Developer Portal and point your App's Development URL to this address.

### 2. The Landing Page
The landing page is a pure static HTML/CSS website. You can view it by opening `Landing Page/index.html` in any web browser.

## Deployment

### App Backend
Run `npm run build` inside the `Image to Frame` folder. This will output a `dist` folder. You can deploy this static folder to any hosting provider (e.g., Vercel, Netlify).

### Landing Page
Deploy the contents of the `Landing Page` folder to any static hosting provider. Update your Canva Developer Portal with the resulting public URLs for Support, Privacy, and Terms of Service.

## Features
- **Smart Tracing:** Automatically identifies and isolates internal transparent holes in images using a custom BFS flood-fill algorithm.
- **Instant Frames:** Uses `dropTarget: true` in the Canva Apps SDK to seamlessly convert shapes into functional frames.
- **Layer Optimization:** Automatically layers the native drop-target frame *above* the mockup image for seamless drag-and-drop interactions without needing to ungroup elements.

## License
&copy; 2026 CanFrame. All rights reserved.
