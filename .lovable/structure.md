# SocioSync (Social Sync Connect)

SocioSync is an AI-powered social media management and content orchestration platform. It streamlines the workflow for creators and social media managers by providing a centralized workspace to generate, draft, and publish content across platforms, with a focus on high-quality AI assistance and direct integrations.

## Key Features
- **AI-Powered Generation**: Integrated AI tools to help generate post ideas and full drafts.
- **Cross-Platform Publishing**: Direct publishing and scheduling, starting with LinkedIn.
- **Modern Workspace**: A Reddit-inspired, compact UX for managing multiple drafts and media attachments.
- **Subscription Management**: Tiered access and payment processing integrated via Polar.
- **Scalable Backend**: Built on Supabase for real-time data, authentication, and secure media storage.

# Project Structure

```text
social-sync-connect/
├── .lovable/                 # Lovable development and planning
│   ├── plan.md              # Project implementation plan
│   └── structure.md         # This file
├── public/                  # Static assets
├── src/                     # Main source code
│   ├── assets/              # Images, fonts, and other assets
│   ├── components/          # React components
│   │   ├── ui/              # shadcn/ui shared components
│   │   ├── BrandMark.tsx    # Brand logo component
│   │   ├── SiteFooter.tsx   # Global site footer
│   │   ├── SiteNav.tsx      # Main navigation sidebar/header
│   │   └── WorkspacePreview.tsx # Dashboard workspace card
│   ├── hooks/               # Custom React hooks
│   ├── integrations/        # External service integrations
│   │   └── supabase/        # Supabase client and types
│   ├── lib/                 # Utility functions and shared logic
│   │   ├── auth.tsx         # Authentication logic/context
│   │   ├── image-validation.ts # Media processing utilities
│   │   ├── plans.ts         # Subscription tier definitions
│   │   ├── subscription.functions.ts # Subscription management
│   │   └── utils.ts         # Tailwind merger and helpers
│   ├── routes/              # TanStack Router page components
│   │   ├── __root.tsx       # Root layout wrapper
│   │   ├── index.tsx        # Landing page
│   │   ├── login.tsx        # Auth page
│   │   ├── app.tsx          # Main dashboard
│   │   ├── drafts.tsx       # Content management
│   │   ├── settings.tsx     # User & workspace settings
│   │   ├── pricing.tsx      # Pricing table
│   │   ├── methodology.tsx  # Product explanation
│   │   ├── privacy.tsx      # Privacy policy
│   │   ├── terms.tsx        # Terms of service
│   │   ├── api.generate.ts  # AI generation endpoint (edge)
│   │   ├── api.linkedin.*   # LinkedIn OAuth and publishing
│   │   └── api.polar.*      # Polar payment webhooks and portal
│   ├── routeTree.gen.ts     # Auto-generated TanStack route tree
│   ├── router.tsx           # Router instance configuration
│   └── styles.css           # Global Tailwind & base styles
├── supabase/                # Backend configuration
│   ├── migrations/          # SQL database migrations
│   └── config.toml          # Supabase project settings
├── .env                     # Local environment variables
├── components.json          # shadcn/ui configuration
├── eslint.config.js         # Linting rules
├── package.json             # Dependencies and scripts
├── tsconfig.json            # TypeScript configuration
├── vite.config.ts           # Vite build tool configuration
└── wrangler.jsonc           # Cloudflare Pages/Workers config
```

# Recent Changes

## 2026-05-14
- **Documentation**: Created `structure.md` and added comprehensive project description and feature list.
- **Workflow**: Established a pattern to record all future code changes in this file for persistent context.
- **Drafts Management**: Enhanced the drafts route (`/drafts`) with improved media management capabilities.
- **Media UX**: Implemented a horizontal scrollable view for images and file attachments in the drafts modal, aligning it with the main workspace experience.
- **Header Actions**: Relocated media upload buttons to the modal header and removed redundant UI elements like image counts and footer upload buttons for a cleaner interface.
- **Persistence**: Updated draft saving and LinkedIn publishing logic to support both images and file attachments in the drafts library.
- **Legal Infrastructure**: Added dedicated `Privacy Policy` and `Terms of Service` pages to the landing page and footer to ensure transparency and compliance for LinkedIn OAuth and data handling.
- **Dynamic Pricing**: Updated the pricing page (`/pricing`) to dynamically reflect the user's current subscription status and admin privileges, highlighting active plans and granting full access to admin users.
