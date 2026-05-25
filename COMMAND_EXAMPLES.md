# CloudBrain Command Examples

**Complete command reference for all channels**

---

## Table of Contents

1. [Telegram Examples](#telegram-examples)
2. [Discord Examples](#discord-examples)
3. [WhatsApp Examples](#whatsapp-examples)
4. [Advanced Patterns](#advanced-patterns)

---

## TELEGRAM EXAMPLES

**Best for**: Quick commands, conversational style

### Domain Management

```
👤 You:
"Show me all my domains"

🤖 CloudBrain:
✅ Found 5 domains

📋 Your Domains:
• example.com (Active)
• dev.example.com (Active)
• blog.example.com (Active)
• old-site.io (Pending)
• test.com (Inactive)

---

👤 You:
"Create domain api.mycompany.com"

🤖 CloudBrain:
🚀 Starting domain creation...

⚙️ Phase 1/3: Validating Domain
[██████░░░░░░░░░░░░] 30%

⚙️ Phase 2/3: Registering Zone
[████████████░░░░░░] 60%

⚙️ Phase 3/3: Setting Up DNS
[██████████████████] 100%

✅ Domain created successfully!
Duration: 45s

📊 Summary:
• Domain: api.mycompany.com
• Zone ID: 6733f0a4-5412-4c1c-959d-3edfc621e020
• Status: Active

---

👤 You:
"Delete old-site.io"

🤖 CloudBrain:
⚠️ Are you sure? This will delete:
• Domain: old-site.io
• All DNS records
• All configurations

Reply "yes" to confirm

👤 You:
"yes"

🤖 CloudBrain:
✅ Domain deleted successfully
Removal time: 2s
```

### DNS Records

```
👤 You:
"Add A record for api.example.com pointing to 192.0.2.1"

🤖 CloudBrain:
⚙️ Phase 1/2: Validating Record
[████████░░░░░░░░░░] 40%

⚙️ Phase 2/2: Creating DNS Record
[██████████████░░░░] 80%

✅ A record created successfully!

📊 Details:
• Name: api.example.com
• Type: A
• Content: 192.0.2.1
• TTL: Auto
• Status: Active

---

👤 You:
"List all CNAME records for example.com"

🤖 CloudBrain:
📋 CNAME Records for example.com:

• cdn.example.com → cdnprovider.net (Active)
• www.example.com → example.com (Active)
• mail.example.com → mailprovider.com (Active)

Total: 3 records

---

👤 You:
"Update MX record priority to 10"

🤖 CloudBrain:
⚠️ Multiple MX records found. Which one?

1️⃣ mail.example.com (priority: 5)
2️⃣ mail2.example.com (priority: 10)
3️⃣ mail3.example.com (priority: 20)

👤 You:
"First one"

🤖 CloudBrain:
✅ MX record updated!
New priority: 10
```

### Workers Management

```
👤 You:
"List my workers"

🤖 CloudBrain:
📋 Your Workers:

1. **my-api-worker** (Active)
   • Last deployed: 2 hours ago
   • CPU time: 45ms avg
   • Requests: 1,234/day

2. **image-processor** (Active)
   • Last deployed: 1 day ago
   • CPU time: 120ms avg
   • Requests: 89/day

3. **backup-script** (Inactive)
   • Last deployed: 1 week ago
   • Requests: 0/day

Total: 3 workers

---

👤 You:
"Deploy worker-2024"

🤖 CloudBrain:
🚀 Starting worker deployment...

⚙️ Phase 1/3: Building Code
[████████░░░░░░░░░░] 30%

⚙️ Phase 2/3: Uploading to Cloudflare
[████████████░░░░░░] 65%

⚙️ Phase 3/3: Activating Worker
[██████████████████] 100%

✅ Worker deployed successfully!
Duration: 15s

📊 Deployment Details:
• Name: worker-2024
• Size: 256KB
• Status: Active
• Logs: https://dash.cloudflare.com/workers

---

👤 You:
"Get analytics for my-api-worker last 120 minutes"

🤖 CloudBrain:
📊 Worker Analytics: my-api-worker

📈 Performance (Last 2 hours):
• Total requests: 2,456
• Errors: 12 (0.5%)
• Average CPU time: 42ms
• P95 CPU time: 150ms
• P99 CPU time: 250ms

💾 Cache Performance:
• Cache hit rate: 78%
• Cache size: 45MB
• Saved bandwidth: 1.2GB
```

### KV Namespace

```
👤 You:
"Create KV namespace for cache"

🤖 CloudBrain:
🚀 Creating KV namespace...

✅ KV namespace created!

📊 Details:
• Name: cache
• ID: a1b2c3d4-e5f6-7g8h-9i0j
• Bindings: 0
• Keys: 0

---

👤 You:
"List my KV namespaces"

🤖 CloudBrain:
📋 Your KV Namespaces:

1. **cache**
   • Keys: 1,234
   • Size: ~5MB
   • Created: 2 weeks ago

2. **config**
   • Keys: 45
   • Size: ~100KB
   • Created: 1 month ago

3. **sessions**
   • Keys: 567
   • Size: ~2MB
   • Created: 3 days ago

Total: 3 namespaces
```

### D1 Database

```
👤 You:
"Create database production"

🤖 CloudBrain:
🚀 Creating D1 database...

✅ Database created!

📊 Details:
• Name: production
• ID: 6733f0a4-5412-4c1c-959d-3edfc621e020
• Size: 0B
• Tables: 0
• Backups: 1 (automatic)

---

👤 You:
"Query select count(*) as user_count from users"

🤖 CloudBrain:
⚙️ Executing query...

✅ Query executed!

📊 Results:
user_count: 12,456

Execution time: 34ms

---

👤 You:
"List my databases"

🤖 CloudBrain:
📋 Your D1 Databases:

1. **production**
   • Size: 125MB
   • Tables: 8
   • Last query: 2 minutes ago

2. **staging**
   • Size: 45MB
   • Tables: 8
   • Last query: 1 hour ago

3. **analytics**
   • Size: 250MB
   • Tables: 15
   • Last query: 30 minutes ago

Total: 3 databases
```

### R2 Storage

```
👤 You:
"Create R2 bucket for media"

🤖 CloudBrain:
🚀 Creating R2 bucket...

✅ R2 bucket created!

📊 Details:
• Bucket: media
• Region: Auto
• Objects: 0
• Size: 0B
• URL: https://media.example.com

---

👤 You:
"Upload report.pdf"

🤖 CloudBrain:
🚀 Uploading file...

📦 report.pdf
[████████░░░░░░░░░░] 40%

📦 report.pdf
[██████████████████] 100%

✅ File uploaded!

📊 Details:
• Filename: report.pdf
• Size: 2.5MB
• URL: https://media.example.com/report.pdf
• Upload time: 5s

---

👤 You:
"List files in media bucket"

🤖 CloudBrain:
📋 Files in media bucket:

1. report.pdf (2.5MB)
2. image1.jpg (1.2MB)
3. image2.jpg (980KB)
4. video.mp4 (45MB)
5. backup.zip (120MB)

📊 Storage Summary:
• Total files: 5
• Total size: 169.7MB
• Usage: 0.17% of plan
```

### Automation & Workflows

```
👤 You:
"Create daily backup at 3 AM"

🤖 CloudBrain:
🎯 Recommendation: WORKFLOW
Confidence: 95%

Why: Simple scheduled task, perfect for Workflows

📋 Create workflow?
• Trigger: Schedule (Daily at 3:00 AM)
• Action: Run backup job
• Notification: Email on completion

Reply "proceed" to create

👤 You:
"Proceed"

🤖 CloudBrain:
🚀 Creating workflow...

✅ Workflow created!

📊 Details:
• Name: daily-backup
• Trigger: Schedule (Daily 3:00 AM UTC)
• Status: Active
• Next run: Tomorrow at 3:00 AM
• ID: wf_12345

---

👤 You:
"When files arrive in uploads folder, process them"

🤖 CloudBrain:
🎯 Recommendation: HYBRID
Confidence: 78%

Why: Mix of simple (trigger) and complex (processing)

Suggests:
• Workflow for trigger detection
• Worker for file processing logic
• Cost estimate: ~$0.03 per execution

Reply with your preference:
1️⃣ Workflow only (simple)
2️⃣ Worker only (complex)
3️⃣ Hybrid (recommended)
```

### AI Generation

```
👤 You:
"Generate image of sunset over mountains"

🤖 CloudBrain:
🤖 Generating image...

[████░░░░░░░░░░░░░░] 25%
[████████░░░░░░░░░░] 50%
[████████████░░░░░░] 75%
[██████████████████] 100%

✅ Image generated!

[Image preview]

📊 Details:
• Model: Stable Diffusion XL
• Prompt: sunset over mountains
• Generation time: 8s
• Cost estimate: $0.0015

---

👤 You:
"Transcribe my voice message"

🤖 CloudBrain:
🎤 Processing audio...

[████████░░░░░░░░░░] 50%
[██████████████████] 100%

✅ Transcription complete!

📝 Transcribed text:
"Hello, this is my voice message for the meeting tomorrow"

📊 Details:
• Duration: 3.2s
• Confidence: 98%
• Model: Whisper
• Processing time: 2s

---

👤 You:
"Write product description for coffee"

🤖 CloudBrain:
✍️ Generating text...

✅ Description generated!

☕ Premium Arabica Blend
Indulge in our carefully curated single-origin coffee, 
roasted to perfection. Notes of chocolate and hazelnut 
with a smooth finish. Perfect for your morning ritual.

📊 Details:
• Tokens used: 127
• Model: Mistral 7B
• Generation time: 1.2s
• Cost estimate: $0.0006
```

### Media Management

```
👤 You:
"Upload this report to storage"

🤖 CloudBrain:
📦 Processing file...

🚀 Uploading to R2...

[████░░░░░░░░░░░░░░] 20%
[████████░░░░░░░░░░] 50%
[██████████████░░░░] 75%
[██████████████████] 100%

✅ File uploaded!

📊 Details:
• Filename: report.pdf
• Size: 2.5MB
• URL: https://r2.example.com/report.pdf
• Upload time: 12s

---

👤 You:
"Download latest backup"

🤖 CloudBrain:
📦 Preparing download...

[████████████████░░] 80%
[██████████████████] 100%

✅ Ready for download!

📊 Details:
• Filename: backup-2024-05-25.zip
• Size: 125MB
• Link: https://r2.example.com/backup-2024-05-25.zip
• Expires: 24 hours

---

👤 You:
"Move images to permanent storage"

🤖 CloudBrain:
🚀 Moving files...

⚙️ Phase 1/3: Finding images
[██████░░░░░░░░░░░░] 30%

⚙️ Phase 2/3: Copying to permanent
[████████████░░░░░░] 65%

⚙️ Phase 3/3: Deleting from temp
[██████████████████] 100%

✅ Move completed!

📊 Summary:
• Files moved: 45
• Total size: 125MB
• Duration: 2m 15s
```

### Status & Monitoring

```
👤 You:
"Show status of all services"

🤖 CloudBrain:
📊 System Status:

✅ Cloudflare API: Operational
✅ Workers: 3 active, 0 errors
✅ KV: 3 namespaces, healthy
✅ D1: 3 databases, healthy
✅ R2: 2 buckets, 169.7MB used
✅ Workflows: 2 active, no errors

🟢 Overall: All systems operational

Last checked: 2 minutes ago
```

---

## DISCORD EXAMPLES

**Best for**: Structured commands, team collaboration

### Slash Commands

```
👤 You:
/cloudflare list-domains

🤖 CloudBrain:
✅ Found 5 domains

📋 Your Domains:
┌─────────────────────────────────────┐
│ Domain                  │ Status    │
├─────────────────────────────────────┤
│ example.com             │ Active    │
│ dev.example.com         │ Active    │
│ blog.example.com        │ Active    │
│ old-site.io             │ Pending   │
│ test.com                │ Inactive  │
└─────────────────────────────────────┘

---

👤 You:
/cloudflare create-zone name: api.example.com plan: free

🤖 CloudBrain:
🚀 Creating zone...
⏳ Please wait...

✅ Zone created successfully!

**Zone Details:**
- **Name:** api.example.com
- **ID:** 6733f0a4-5412-4c1c-959d-3edfc621e020
- **Plan:** Free
- **Status:** Active
- **Nameservers:** ns1.cloudflare.com, ns2.cloudflare.com

👤 You:
/cloudflare dns-create zone: example.com type: A name: api content: 192.0.2.1

🤖 CloudBrain:
🚀 Creating DNS record...

✅ DNS record created!

**Record Details:**
- **Name:** api.example.com
- **Type:** A
- **Content:** 192.0.2.1
- **TTL:** Auto
- **Status:** Active

---

👤 You:
/cloudflare workers-list

🤖 CloudBrain:
📋 Your Workers

| Worker | Status | CPU (avg) | Requests/day |
|--------|--------|-----------|--------------|
| my-api-worker | ✅ Active | 45ms | 1,234 |
| image-processor | ✅ Active | 120ms | 89 |
| backup-script | ⏸️ Inactive | - | 0 |

---

👤 You:
/cloudflare deploy-worker name: my-worker

🤖 CloudBrain:
🚀 Deploying worker...
⏳ Please wait...

**Deployment Progress:**
- ✅ Build complete
- ✅ Upload complete
- ✅ Activation complete

✅ Worker deployed successfully!

**Details:**
- **Name:** my-worker
- **Status:** Active
- **Logs:** [View Logs](https://dash.cloudflare.com)

---

👤 You:
/cloudflare db-query database: production query: select count(*) as users from users

🤖 CloudBrain:
⏳ Executing query...

✅ Query executed! (34ms)

```
users
------
12456
```

---

👤 You:
/cloudflare r2-list-bucket bucket: media

🤖 CloudBrain:
📋 Files in media bucket

| Filename | Size | Uploaded |
|----------|------|----------|
| report.pdf | 2.5MB | 2h ago |
| image1.jpg | 1.2MB | 1d ago |
| video.mp4 | 45MB | 3d ago |

**Storage Summary:**
- Files: 3
- Total: 48.7MB
- Usage: 0.05%

---

👤 You:
/cloudflare create-automation type: workflow trigger: schedule schedule: daily time: 03:00 action: backup

🤖 CloudBrain:
🎯 **Automation Recommendation**

✅ **Type:** Workflow
📊 **Confidence:** 95%

**Why this approach:**
- Simple scheduled task
- Perfect for Workflows
- No complex logic needed

**Configuration:**
- **Trigger:** Daily at 03:00 UTC
- **Action:** Run backup
- **Status:** Ready to deploy

👤 You: Click "Create" button

✅ Automation created!

---

👤 You:
/ai-generate prompt: sunset over mountains style: oil painting

🤖 CloudBrain:
🤖 Generating image...
[████████████████████] 100% (8s)

[Embedded image]

**Generation Details:**
- **Model:** Stable Diffusion XL
- **Prompt:** sunset over mountains
- **Style:** oil painting
- **Time:** 8s
- **Cost:** $0.0015
```

### Thread Conversations

```
👤 You:
Create a thread: "Manage DNS records"

🤖 CloudBrain:
💬 Thread: Manage DNS records

---

👤 You (in thread):
"List all records for example.com"

🤖 CloudBrain:
📋 DNS Records for example.com:

**A Records:**
- example.com → 192.0.2.1 ✅
- www.example.com → 192.0.2.1 ✅

**CNAME Records:**
- cdn.example.com → cdnprovider.net ✅

**MX Records:**
- mail.example.com (priority: 5) ✅

---

👤 You (in thread):
"Update cdn record to new provider"

🤖 CloudBrain:
✅ Updated!

**CNAME Record Updated:**
- **Name:** cdn.example.com
- **Old Target:** cdnprovider.net
- **New Target:** newcdn.example.com
- **Status:** Active

---

👤 You (in thread):
"Add TXT record for SPF"

🤖 CloudBrain:
✅ TXT record added!

**Record Details:**
- **Name:** example.com
- **Type:** TXT
- **Value:** v=spf1 include:sendgrid.net ~all
- **Status:** Active
```

---

## WHATSAPP EXAMPLES

**Best for**: Mobile-first, quick responses

### Natural Messages

```
👤 You:
my domains

🤖 CloudBrain:
5 domains found

1. example.com ✅
2. dev.example.com ✅
3. blog.example.com ✅
4. old-site.io ⏳
5. test.com ⏸️

---

👤 You:
create domain api.mycompany.com

🤖 CloudBrain:
🚀 Creating...

⚙️ Validating domain
✅ Registering zone
✅ Setting up DNS

✅ Done in 45s

Domain: api.mycompany.com
Zone ID: 6733f0a4...
Status: Active

---

👤 You:
add A record api.example.com 192.0.2.1

🤖 CloudBrain:
⚙️ Creating...
✅ Created!

Name: api.example.com
Type: A
Content: 192.0.2.1
Status: Active

---

👤 You:
list workers

🤖 CloudBrain:
3 workers found

1. my-api-worker ✅ (45ms)
2. image-processor ✅ (120ms)
3. backup-script ⏸️

---

👤 You:
deploy my-worker

🤖 CloudBrain:
🚀 Deploying...

✅ Build complete
✅ Upload complete
✅ Activated!

Duration: 15s

---

👤 You:
database query select count(*) from users

🤖 CloudBrain:
⏳ Running query...

Result:
users: 12456

Time: 34ms

---

👤 You:
upload report.pdf

🤖 CloudBrain:
📦 Uploading...

[████████████████] 100% (12s)

✅ Uploaded!

URL: https://r2.example.com/report.pdf

---

👤 You:
download latest backup

🤖 CloudBrain:
📦 Preparing...

✅ Ready!

File: backup-2024-05-25.zip
Size: 125MB
Link: https://r2.example.com/backup-2024-05-25.zip
Expires: 24h

---

👤 You:
generate image sunset mountains

🤖 CloudBrain:
🤖 Generating...

[████████████████] 100% (8s)

✅ Generated!

[Image]

Cost: $0.0015

---

👤 You:
transcribe audio

🤖 CloudBrain:
🎤 Processing...

✅ Done! (2s)

"Hello, voice message test"

Confidence: 98%

---

👤 You:
workflow daily backup 3am

🤖 CloudBrain:
🎯 Recommendation: WORKFLOW
✅ Confidence: 95%

Create workflow?
• Daily at 3:00 AM
• Run backup
• Email notification

---

👤 You:
yes

🤖 CloudBrain:
✅ Workflow created!

Name: daily-backup
Trigger: Daily 3 AM
Next run: Tomorrow 3 AM
Status: Active

---

👤 You:
status check

🤖 CloudBrain:
✅ Cloudflare API: OK
✅ Workers: 3 active
✅ KV: 3 namespaces
✅ D1: 3 databases
✅ R2: 169.7MB used

All systems operational ✅
```

---

## ADVANCED PATTERNS

### Multi-Step Automation (All Channels)

```
👤 You:
"Create database for users, deploy worker that queries it, 
set up daily backups"

🤖 CloudBrain (Multi-Step):

🚀 Starting multi-step operation...

⚙️ Phase 1/3: Create Database
[████████░░░░░░░░░░] 30%
✅ Database 'users' created

⚙️ Phase 2/3: Deploy Worker
[████████████░░░░░░] 65%
✅ Worker 'user-query' deployed

⚙️ Phase 3/3: Set Up Backups
[██████████████████] 100%
✅ Backup workflow scheduled

✅ All tasks completed!

📊 Summary:
• Database: users (125MB)
• Worker: user-query (active)
• Backup: Daily at 3 AM
• Duration: 2m 15s
```

### Error Recovery (All Channels)

```
👤 You:
"Create domain invalid domain name"

🤖 CloudBrain:
❌ Error: Invalid domain format

Domain must:
- Be valid format (example.com)
- Not contain spaces
- Not contain special characters

💡 Try this:
"Create domain valid-domain.com"

👤 You:
"Create domain valid-domain.com"

🤖 CloudBrain:
✅ Domain created successfully!
```

### Batch Operations (All Channels)

```
👤 You:
"Upload 10 files from folder"

🤖 CloudBrain:
📦 Batch upload started...

Processing: file1.pdf [████░░░░░░░░░░░░░░] 10%
Processing: file2.pdf [████████░░░░░░░░░░] 20%
Processing: file3.pdf [████████████░░░░░░] 30%
...
Processing: file10.pdf [██████████████████] 100%

✅ Batch upload complete!

📊 Results:
• Total files: 10
• Successful: 10
• Failed: 0
• Total size: 125MB
• Duration: 5m 30s
```

---

## Tips & Tricks

### Get Faster Responses
```
❌ Slow: "Can you please create a domain for my website"
✅ Fast: "Create domain example.com"
```

### Get Better Results
```
❌ Vague: "Generate an image"
✅ Clear: "Generate sunset landscape with mountains, oil painting style"
```

### Check Status Anytime
```
All channels:
"What's the status?"
"Check worker health"
"Show recent errors"
```

### Cancel Operations
```
❌ Not supported yet
Use: Create next operation to replace
```

---

**Need more examples?** Check `ADVANCED_FEATURES.md` for detailed documentation!
