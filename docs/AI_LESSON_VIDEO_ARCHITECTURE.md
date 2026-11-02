# AI Lesson Video Generation Architecture

## Purpose
This document describes how AI lesson-video generation is requested, processed, stored, and delivered in Ai_Mentor.

## System Overview
The workflow spans the frontend, Node.js backend, Python AI service, and media storage.

```text
Learner
  |
  v
Frontend
  |
  v
Node.js API
  |
  v
Python AI service
  |
  +--> Generate lesson content
  +--> Generate voice/audio
  +--> Render video
  |
  v
Store generated assets
  |
  v
Return status and video to frontend