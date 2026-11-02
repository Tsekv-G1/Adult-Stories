---
title: Adult Stories Audio Processor
sdk: docker
app_port: 7860
---

# Audio processor for Hugging Face Spaces

Create a private Docker Space and copy this directory into it. Set the Space secret `AUDIO_PROCESSOR_TOKEN` to a long random value. Set `AUDIO_PROCESSOR_URL` in Netlify to the Space's `https://<space-name>.hf.space` URL and set the same token in Netlify. The API only accepts authenticated requests and uploads only to short-lived R2 PUT URLs supplied by the server. The Space needs enough RAM and request time for FFmpeg; a request can run for several minutes.

The worker joins the ElevenLabs voice chunks, mixes a quiet Hugging Face music track under the voice, normalizes the result, cuts a short preview from the finished mix, and uploads the private full recording plus public preview directly to R2. It does not retain uploaded files after the request. Deploy the complete `audio-worker` directory so that `requirements.txt`, `Dockerfile`, and `app.py` are all present.
