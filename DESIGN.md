# Design System Inspired by Sanrio Gift Gate

## 1. Visual Theme & Atmosphere

The Sanrio Gift Gate design system embodies playful charm and warm approachability, centered around beloved kawaii characters and charming product experiences. The visual personality is youthful, friendly, and emotionally engaging—perfect for a character merchandise platform that celebrates joy and collectibility. Bright accent colors dominate navigation and call-to-action areas, while soft pastels and pastimes from the character universe create delight across product cards and promotional sections. The system balances clean, minimal layouts with whimsical character illustrations, creating an environment where shopping feels like entering a beloved universe rather than a transaction.

**Key Characteristics**
- Vibrant fuchsia as the dominant brand voice
- Soft pastel accent colors reflecting character themes (sky blue, mint, warm browns)
- Friendly, rounded interactions and playful spacing
- Character-driven visual storytelling in banners and cards
- High contrast between background and interactive elements for clarity
- Clean typography on generous whitespace
- Warm, inviting atmosphere that encourages exploration and collection

## 2. Color Palette & Roles

### Primary
- **Brand Fuchsia** (`#EF4C7F`): Primary call-to-action buttons, navigation bar background, active state indicators, promotional banners, and brand identity anchor (117 uses)
- **Brand Fuchsia Secondary** (`#EC2F7A`): Alternative primary accent for variant states and emphasis

### Accent Colors
- **Sky Blue** (`#337AB7`): Secondary navigation, hover states, informational sections, complementary accent to fuchsia (36 uses)
- **Bright Sky Blue** (`#3493FB`): Accent for specific UI elements and interactive focus states
- **Soft Mint** (`#AADDDD`): Tertiary accent color for gentle visual interest and character-themed sections
- **Pastel Green** (`#AABBAA`): Soft accent for category cards and secondary promotional areas (6 uses)
- **Warm Brown** (`#765D57`): Neutral accent for character illustrations and product backgrounds (30 uses)

### Interactive
- **Link Blue** (`#337AB7`): Default hyperlink color for navigation and inline text links
- **Warning Yellow** (`#FDC500`): Alert and warning states, time-sensitive promotions, attention-grabbing secondary badges (5 uses)

### Neutral Scale
- **Text Primary** (`#333333`): Body text, default text color, primary readability (434 uses)
- **Text Light** (`#A1A1A1`): Secondary text, disabled states, subtle labels
- **Border Light** (`#CCCCCC`): Dividers, hairlines, subtle container borders
- **Border Lighter** (`#DDDDDD`): Soft dividers between product sections
- **Surface Subtle** (`#FAFAFA`): Minimal background tint for sections, near-white containers (2 uses)
- **Text Dark** (`#000000`): High-emphasis text, dark mode variants

### Surface & Borders
- **White** (`#FFFFFF`): Primary background, card surfaces, navigation background, maximum contrast with text (587 uses)

## 3. Typography Rules

### Font Family
**Primary**: Noto Sans TC (Google Fonts: https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;700&display=swap)
**Fallback Stack**: Noto Sans TC, system-ui, -apple-system, sans-serif

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|---|---|---|---|---|---|---|
| Display / H1 | Noto Sans TC | 32px | 700 | 45.7px | 0px | Large promotional headlines, hero sections |
| Heading / H2 | Noto Sans TC | 28px | 700 | 40px | 0px | Section titles, category headers |
| Subheading / H3 | Noto Sans TC | 24px | 700 | 34.3px | 0px | Subsection titles, card titles |
| Title / H4 | Noto Sans TC | 20px | 700 | 28.6px | 0px | Product names, strong emphasis |
| Subtitle | Noto Sans TC | 16px | 700 | 22.9px | 0px | Small titles, badge text |
| Body | Noto Sans TC | 14px | 400 | 20px | 0px | Primary body text, product descriptions, form labels |
| Body Small | Noto Sans TC | 12px | 400 | 17.1px | 0px | Secondary text, captions, fine print |
| Link | Noto Sans TC | 16px | 400 | 22.9px | 0px | Navigation links, inline hyperlinks |
| Link Small | Noto Sans TC | 14px | 400 | 20px | 0px | Secondary navigation, footer links |
| Button | Noto Sans TC | 14px | 400 | 20px | 0px | CTA text, interactive elements |
| Code | Noto Sans TC | 13px | 400 | 18.6px | 0px | Monospace reference, technical copy |

### Principles
- Typography prioritizes clarity and emotional warmth over complexity
- Line heights are generous to maximize readability in a playful context
- Weight variation (400/700) creates clear visual hierarchy without font proliferation
- All sizes use px-based measurements for pixel-perfect implementation
- This project is Thai/English only — Noto Sans TC is used for its Latin letterforms (see `src/lib/fonts.ts`), not for Chinese support; Noto Sans Thai covers Thai glyphs

## 4. Component Stylings

### Buttons

#### Primary Button
- **Background**: `#EF4C7F`
- **Text Color**: `#FFFFFF`
- **Font Size**: `14px`
- **Font Weight**: `400`
- **Line Height**: `20px`
- **Padding**: `10px 10px 10px 10px`
- **Width**: `156px`
- **Height**: `auto`
- **Border**: `0px none`
- **Border Radius**: `0px`
- **Box Shadow**: `none`
- **Hover State**: Background `#EC2F7A`, Box Shadow `rgba(0, 0, 0, 0.08) 0px 10px 20px 0px`
- **Active State**: Background `#D93F6B`, opacity `0.98`
- **Disabled State**: Background `#333333`, opacity `0.5`

#### Secondary Button
- **Background**: `rgba(0, 0, 0, 0)`
- **Text Color**: `#333333`
- **Font Size**: `14px`
- **Font Weight**: `400`
- **Line Height**: `20px`
- **Padding**: `0px 0px 0px 0px`
- **Width**: `auto`
- **Height**: `auto`
- **Border**: `0px none`
- **Border Radius**: `0px`
- **Box Shadow**: `none`
- **Hover State**: Text Color `#337AB7`
- **Active State**: Text Color `#1A5C8C`

#### Ghost Button (Icon)
- **Background**: `rgba(0, 0, 0, 0)`
- **Text Color**: `#333333`
- **Font Size**: `22px`
- **Font Weight**: `400`
- **Line Height**: `31.4px`
- **Padding**: `0px 0px 0px 0px`
- **Width**: `auto`
- **Height**: `auto`
- **Border**: `0px none`
- **Border Radius**: `0px`
- **Box Shadow**: `none`
- **Hover State**: Opacity `0.7`

#### Tertiary Button (Outline)
- **Background**: `rgba(0, 0, 0, 0)`
- **Text Color**: `#333333`
- **Font Size**: `16px`
- **Font Weight**: `400`
- **Line Height**: `22.9px`
- **Padding**: `1px 6px 1px 6px`
- **Height**: `27px`
- **Border**: `1px outset #000000`
- **Border Radius**: `0px`
- **Box Shadow**: `none`

### Cards & Containers

#### Product Card
- **Background**: `#FFFFFF`
- **Border**: `1px solid #DDDDDD`
- **Border Radius**: `0px`
- **Padding**: `0px 0px 0px 0px`
- **Box Shadow**: `none`
- **Hover State**: Box Shadow `rgba(0, 0, 0, 0.03) 8px 8px 8px 0px, rgba(0, 0, 0, 0.03) -2px 8px 8px 0px`

#### Promotional Card (Colored Background)
- **Background**: `#EF4C7F`, `#337AB7`, or `#AABBAA` (category-dependent)
- **Border Radius**: `12px`
- **Padding**: `16px 20px 16px 20px`
- **Text Color**: `#FFFFFF`
- **Font Size**: `18px`
- **Font Weight**: `700`

#### Section Container
- **Background**: `#FFFFFF`
- **Padding**: `20px 16px 20px 16px`
- **Margin**: `0px 0px 0px 0px`
- **Border**: `none`

### Inputs & Forms

#### Text Input
- **Background**: `rgba(0, 0, 0, 0)`
- **Text Color**: `#333333`
- **Font Size**: `14px`
- **Font Weight**: `400`
- **Line Height**: `20px`
- **Padding**: `5px 0px 5px 0px`
- **Width**: `calc(100% - 60px)`
- **Height**: `auto`
- **Border**: `0px none`
- **Border Bottom**: `1px solid #CCCCCC`
- **Border Radius**: `0px`
- **Focus State**: Border Bottom `1px solid #337AB7`
- **Placeholder Color**: `#A1A1A1`

#### Input Focus
- **Border Color**: `#337AB7`
- **Box Shadow**: `none`
- **Text Color**: `#333333`

### Navigation

#### Main Navigation Bar
- **Background**: `#EF4C7F`
- **Width**: `100%`
- **Height**: `auto`
- **Padding**: `0px 0px 0px 0px`
- **Font Size**: `16px`
- **Font Weight**: `400`
- **Line Height**: `22.9px`
- **Text Color**: `#FFFFFF`
- **Box Shadow**: `rgba(0, 0, 0, 0.06) 0px 2px 6px 0px`
- **Z-index**: `20`

#### Navigation Link (Default)
- **Color**: `#FFFFFF`
- **Font Size**: `16px`
- **Font Weight**: `400`
- **Padding**: `12px 16px 12px 16px`
- **Border Bottom**: `none`
- **Hover State**: Background `rgba(255, 255, 255, 0.1)`, Border Bottom `2px solid #FFFFFF`
- **Active State**: Border Bottom `2px solid #FFFFFF`

#### Dropdown Menu
- **Background**: `#FFFFFF`
- **Border**: `1px solid #CCCCCC`
- **Box Shadow**: `rgba(0, 0, 0, 0.1) 3px 4px 6px -1px, rgba(0, 0, 0, 0.06) 0px 2px 4px -1px, rgba(0, 0, 0, 0.06) -1px -2px 4px -1px`
- **Z-index**: `25`

#### Dropdown Item
- **Color**: `#333333`
- **Padding**: `8px 16px 8px 16px`
- **Hover State**: Background `#FAFAFA`

### Links

#### Hyperlink
- **Color**: `#337AB7`
- **Font Size**: `16px`
- **Font Weight**: `400`
- **Line Height**: `22.9px`
- **Text Decoration**: `none`
- **Hover State**: Text Decoration `underline`, Color `#1A5C8C`
- **Visited State**: Color `#337AB7`

#### Footer Link
- **Color**: `#337AB7`
- **Font Size**: `14px`
- **Font Weight**: `400`
- **Hover State**: Color `#1A5C8C`, Text Decoration `underline`

### Badges & Labels

#### Alert Badge
- **Background**: `#FDC500`
- **Text Color**: `#333333`
- **Font Size**: `12px`
- **Font Weight**: `700`
- **Padding**: `4px 8px 4px 8px`
- **Border Radius**: `4px`

#### Category Badge (Colored)
- **Background**: `#EF4C7F`, `#337AB7`, or `#AABBAA`
- **Text Color**: `#FFFFFF`
- **Font Size**: `12px`
- **Font Weight**: `700`
- **Padding**: `6px 12px 6px 12px`
- **Border Radius**: `16px`

## 5. Layout Principles

### Spacing System

**Base Unit**: `4px`

**Scale**:
- `4px`: Micro spacing (between inline elements)
- `8px`: Extra small spacing (compact components)
- `12px`: Small spacing (form fields, tight sections)
- `16px`: Small-medium spacing (standard padding)
- `20px`: Medium spacing (section padding, card margins)
- `24px`: Medium-large spacing (between major sections)
- `32px`: Large spacing (major layout gaps)
- `68px`: Extra large spacing (visual breathing room)
- `84px`: Massive spacing (section separation)
- `120px`: Full-screen spacing (hero section margins)
- `140px`: Maximum spacing (full-page padding)

**Context**:
- `16px` padding: Card interiors, form fields, button padding
- `20px` padding: Section containers, major content areas
- `24px` margin: Between major layout blocks
- `32px` padding: Feature sections
- `68px` margin: Between page sections
- `84px` margin: Major viewport breaks
- `120px` margin: Hero section top/bottom
- `140px` padding: Full-page horizontal padding at max width

### Grid & Container

**Max Width**: `1440px`
**Column Strategy**: 12-column responsive grid (inferred from navigation width)
**Section Patterns**:
- Full-width: Navigation, hero banners, category sections
- Contained: Product grids, content cards (max 1440px center-aligned)
- Asymmetric: Left sidebar + right content areas for category navigation

**Breakpoints** (inferred):
- Desktop: `1440px` width containers
- Responsive reflow: Content adapts to viewport with proportional spacing

### Whitespace Philosophy

The design system embraces generous whitespace to create visual breathing room and emphasize character-driven storytelling. Spacing around text and interactive elements improves scannability and emotional comfort. Large vertical margins between sections (68px–120px) establish visual hierarchy and break content into digestible chunks. Padding within containers (16px–20px) ensures content doesn't feel crowded, particularly important for a playful, character-forward brand.

### Border Radius Scale

- `0px`: All buttons, inputs, navigation, primary containers (default sharp aesthetic)
- `4px`: Secondary badges and small alerts
- `12px`: Promotional card containers (softened for emphasis)
- `16px`: Category pill badges, rounded visual elements
- `50%`: Circular elements (character avatars, icon badges)

### Border Widths

- **Thin**: `1px` — Dividers, input borders, card separators, tertiary button outlines
- **Medium**: `2px` — Active navigation underlines, focus states, emphasis borders

## 6. Depth & Elevation

| Level | Treatment | Use |
|---|---|---|
| Base | No shadow | Inputs, buttons, flat containers, navigation |
| Raised (xs) | `rgba(0, 0, 0, 0.06) 0px 2px 6px 0px` | Navigation bar, subtle depth |
| Raised (sm) | `rgba(0, 0, 0, 0.1) 3px 4px 6px -1px, rgba(0, 0, 0, 0.06) 0px 2px 4px -1px, rgba(0, 0, 0, 0.06) -1px -2px 4px -1px` | Dropdown menus, floating elements |
| Raised (md) | `rgba(0, 0, 0, 0.03) 8px 8px 8px 0px, rgba(0, 0, 0, 0.03) -2px 8px 8px 0px` | Product cards on hover, modal transitions |
| Raised (lg) | `rgba(0, 0, 0, 0.08) 0px 10px 20px 0px` | Primary buttons on hover, modals, overlays |

**Shadow Philosophy**: The system employs subtle, directional shadows to create depth without visual heaviness. Shadows are minimal on default states and increase on hover to provide tactile feedback. Darker, larger shadows are reserved for high-priority interactive elements (buttons, modals) to guide focus and emphasize importance in the shopping experience.

### Opacity Levels

- **Subtle Disabled**: `0.5` — Disabled buttons, inactive UI elements
- **Minimal Overlay**: `0.02` — Imperceptible tinting, transition states

### Z-index / Layering

- **Base**: `1` — Default page content, cards, containers
- **Raised**: `2` — Overlapping cards, floating elements
- **Sticky**: `3` — Sticky sections, semi-persistent UI
- **Fixed**: `5` — Fixed navigation components, persistent headers
- **Dropdown**: `10` — Dropdown menus, context menus
- **Modal Backdrop**: `15` — Semi-transparent modal overlays
- **Modal**: `20` — Modal dialogs, primary overlays
- **Tooltip**: `25` — Tooltips, highest-priority floating UI, notifications

## 7. Do's and Don'ts

### Do
- Use **#EF4C7F** (Brand Fuchsia) for all primary CTAs and navigation to maintain brand consistency
- Apply **16px** padding to card containers and **20px** to section containers for visual breathing room
- Stack elements vertically with **24px–68px** margins between major sections to establish clear hierarchy
- Use **0px** border radius on all default UI elements (buttons, inputs, cards) to maintain crisp, modern aesthetic
- Employ **Noto Sans TC** at **400 weight** for body text and **700 weight** for headings to ensure readability
- Apply hover shadows (md: `rgba(0, 0, 0, 0.03) 8px 8px 8px 0px`) to product cards to signal interactivity
- Style navigation links with white text on fuchsia background and add underline on hover/active states
- Use **#337AB7** (Sky Blue) for secondary links and accent elements to create visual variety while maintaining harmony
- Include **#FDC500** (Warning Yellow) badges for time-sensitive promotions (limited offers, new arrivals)
- Center-align content at **1440px max width** for desktop experiences

### Don't
- Don't use color borders on buttons; maintain solid, filled backgrounds for primary actions
- Don't apply rounded corners (`border-radius > 0px`) to standard buttons, inputs, or navigation (reserved for promotional cards at **12px**)
- Don't exceed **20px line height** on body text; maintain compact leading for dense information areas
- Don't combine multiple shadow depths on single elements; select one z-index level per component
- Don't use colors outside the defined palette; stick to the 15 extracted colors for consistency
- Don't apply opacity below **0.5** for disabled states; use clearly visible state instead
- Don't mix font weights within a single text block unless establishing hierarchy
- Don't use **#337AB7** as a background color on large areas; reserve it for accent text and secondary elements
- Don't apply transforms or animations without explicit duration/easing specifications (missing from tokens)
- Don't swap the primary font away from **Noto Sans TC** without checking `src/lib/fonts.ts`'s subsetting — it intentionally loads Latin glyphs only

## 8. Responsive Behavior

### Breakpoints

| Breakpoint | Width | Key Changes |
|---|---|---|
| Mobile | `< 768px` | Single-column layout, full-width cards, reduced padding to `12px`, stacked navigation drawer, font sizes reduced by 2px |
| Tablet | `768px – 1199px` | 2–3 column grid, padding remains `16px`, navigation condenses to dropdown menu, hero banners scale proportionally |
| Desktop | `≥ 1200px` | Full 12-column grid, max container width `1440px`, full navigation bar visible, 3–4 product columns, padding `20px` |

### Touch Targets

- **Minimum Size**: `44px × 44px` — All interactive elements (buttons, links, form fields) must meet minimum touch target size on mobile
- **Spacing Between Targets**: `8px` minimum — Prevent accidental activation of adjacent buttons
- **Button Padding**: `10px` horizontal, `10px` vertical — Ensures comfortable tap areas on all screen sizes
- **Link Hit Area**: Extend padding around inline links to `8px` on mobile to improve accuracy

### Collapsing Strategy

- **Navigation**: Horizontal full-width navigation on desktop (`1440px`) collapses to hamburger icon on tablets and mobile; drawer expands to full width below navigation bar
- **Product Grid**: 4 columns desktop → 3 columns tablet → 2 columns mobile → 1 column extra-small
- **Spacing**: Full margins (`68px–84px`) collapse to `24px–32px` on tablet, `16px–20px` on mobile
- **Hero Banners**: 100% viewport height on desktop → 80% on tablet → 60% on mobile; text sizes scale proportionally
- **Promotional Cards**: Horizontal layout on desktop (3-column) → 2-column on tablet → 1-column on mobile
- **Form Fields**: Input width remains `calc(100% - 60px)` but padding adjusts from `5px` desktop to `8px` mobile for comfort
- **Modals**: Full-screen on mobile (excluding navigation), fixed max-width on desktop

## 9. Agent Prompt Guide

### Quick Color Reference

- **Primary CTA**: Brand Fuchsia (`#EF4C7F`)
- **Secondary CTA**: Sky Blue (`#337AB7`)
- **Navigation Background**: Brand Fuchsia (`#EF4C7F`)
- **Link Text**: Sky Blue (`#337AB7`)
- **Background**: White (`#FFFFFF`)
- **Body Text**: Text Primary (`#333333`)
- **Heading Text**: Text Primary (`#333333`)
- **Disabled Text**: Text Light (`#A1A1A1`)
- **Borders**: Border Light (`#CCCCCC`)
- **Alert/Warning**: Warning Yellow (`#FDC500`)
- **Promotional Cards**: Fuchsia, Sky Blue, or Pastel Green (category-dependent)
- **Accents**: Soft Mint (`#AADDDD`), Warm Brown (`#765D57`)

### Iteration Guide

1. **All primary buttons use #EF4C7F background with #FFFFFF text, 14px font, 10px padding, 0px border-radius, shadow only on hover (lg: `rgba(0, 0, 0, 0.08) 0px 10px 20px 0px`)**

2. **Navigation bar spans 100% width with #EF4C7F background, #FFFFFF text, z-index 20, and xl shadow (`rgba(0, 0, 0, 0.06) 0px 2px 6px 0px`)**

3. **All body text uses Noto Sans TC 14px weight-400 line-height 20px on #FFFFFF background; headings use weight-700 with sizes: H1 32px, H2 28px, H3 24px, H4 20px**

4. **Product cards: #FFFFFF background, 0px border-radius, 1px solid #DDDDDD border, no default shadow, md shadow on hover**

5. **Standard padding increments: 10px buttons, 16px form fields, 20px section containers, 32px feature sections; margins: 24px between blocks, 68px–84px between sections**

6. **Links are #337AB7 with 16px font-weight 400; hover adds underline and changes to #1A5C8C; no visited state styling**

7. **Form inputs: transparent background, 5px vertical padding, 1px solid #CCCCCC bottom border, focus border becomes #337AB7**

8. **Promotional badges: #FDC500 background for warnings/sales, #EF4C7F for category featured, #337AB7 for secondary categories, all 12px weight-700 with 4–12px padding**

9. **All interactive elements maintain 0px border-radius except promotional cards (12px) and circle avatars (50%); never round buttons or inputs**

10. **Dropdown menus: #FFFFFF background, sm shadow, 1px #CCCCCC border, z-index 25, items hover to #FAFAFA with 8px padding**

11. **Responsive reflow: Desktop container 1440px, max 4-column product grid; tablet 2–3 columns with 16px padding; mobile full-width with single column, 12px padding**

12. **Z-index ladder: 1 (base), 2 (raised), 3 (sticky), 5 (fixed), 10 (dropdown), 15 (modal backdrop), 20 (modal), 25 (tooltip); never exceed 25**