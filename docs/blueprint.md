# DriveVideoFetch — Bot specification

**Archetype:** custom

**Voice:** warm and concise — write every user-facing message, button label, error, and empty state in this voice.

A Telegram bot that accepts public Google Drive video links (up to 100 GB), validates them, extracts metadata, and provides download/streaming options. It handles file size constraints, offers temporary proxied URLs for streaming, and includes abuse detection with optional admin notifications.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Public Telegram users
- Video file sharers

## Success criteria

- Validates public Google Drive links
- Provides direct-download and streaming URLs for eligible files
- Handles Telegram file size limits (2 GB max) with fallback options
- Logs submissions for rate-limiting and abuse detection (30-day retention)

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open main menu with instructions
- **/help** (command, actor: user, command: /help) — Show help instructions with 'How it works' button
- **Google Drive link** (message, actor: user, command: /drive_link) — Submit a public Google Drive video link for processing

## Flows

### main_menu
_Trigger:_ /start

1. Send welcome message with instructions
2. Show 'How it works' button

_Data touched:_ User

### link_validation
_Trigger:_ drive_link

1. Extract URL
2. Validate public access
3. Check file size limit (100 GB)

_Data touched:_ Drive link submission, File metadata

### metadata_display
_Trigger:_ valid_drive_link

1. Show filename, size, MIME type
2. Display thumbnail if available
3. Offer action buttons: Download, Stream, Send via Telegram, Cancel

_Data touched:_ File metadata, Delivery artifact

### action_selection
_Trigger:_ button_click

1. Process selected action (Download/Stream/Send)
2. Generate time-limited URLs or attempt Telegram upload
3. Show progress updates

_Data touched:_ Delivery artifact, File metadata

### error_handling
_Trigger:_ invalid_link

1. Display error message
2. Provide instructions to fix public access
3. Log abuse attempt if detected

_Data touched:_ Drive link submission, File metadata

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **User** _(retention: session)_ — Telegram user interacting with the bot
  - fields: telegram_user_id, request_count, last_request_time
- **Drive link submission** _(retention: persistent)_ — Submitted Google Drive link and validation status
  - fields: url, timestamp, is_public, file_size
- **File metadata** _(retention: session)_ — Extracted video file information
  - fields: file_name, size_bytes, mime_type, thumbnail_url, download_status
- **Delivery artifact** _(retention: session)_ — Generated download/streaming options
  - fields: direct_download_url, streaming_url, telegram_upload_status, url_expiration

## Integrations

- **Telegram** (required) — Bot API messaging and file delivery
- **Google Drive** (required) — Read public file metadata and content
- **Admin Webhook** (optional) — Optional error/abuse notifications to admin chat
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Enable/disable admin notifications
- Configure admin chat ID
- Adjust rate limits (requests per minute/day)
- Set proxied URL TTL (default 24 hours)

## Notifications

- Admin chat receives error summaries and abuse reports (when enabled)

## Permissions & privacy

- Only processes public Google Drive links (no user credentials required)
- Anonymized logs retained 30 days for abuse detection
- No file content stored permanently
- Telegram file uploads limited to 2 GB (platform constraint)

## Edge cases

- Non-public Google Drive links
- Files exceeding 100 GB
- Telegram upload failures due to size limits
- Invalid URLs or malformed input
- Repeated abuse attempts triggering rate limits

## Required tests

- Verify /start command shows main menu
- Test public link validation and error handling
- Validate metadata extraction for various video MIME types
- Confirm Telegram upload failsafe for 2 GB files
- Test admin notifications for errors and abuse

## Assumptions

- All user submissions are public Google Drive URLs
- Admin chat configuration is handled via owner controls
- Temporary proxy URLs are generated server-side when needed
