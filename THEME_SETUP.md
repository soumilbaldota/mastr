# Theme Picker Setup

A simple theme picker has been added to the application, allowing users to switch between light, dark, and system themes.

## Components Added

### 1. **ThemeProvider** (`src/components/theme-provider.tsx`)
- Wrapper around `next-themes` ThemeProvider
- Enables theme switching across the app
- Supports SSR/hydration

### 2. **ThemePicker** (`src/components/theme-picker.tsx`)
- Dropdown menu with three theme options:
  - ☀️ **Light** - Light mode
  - 🌙 **Dark** - Dark mode
  - 🖥️ **System** - Follows system preference
- Located in the nav sidebar footer
- Uses shadcn/ui dropdown-menu component

## Integration

### Layout (`src/app/layout.tsx`)
```tsx
<ThemeProvider
  attribute="class"
  defaultTheme="system"
  enableSystem
  disableTransitionOnChange
>
  {/* App content */}
</ThemeProvider>
```

- `attribute="class"` - Uses `.dark` class for dark mode (matches CSS)
- `defaultTheme="system"` - Defaults to system preference
- `enableSystem` - Allows "System" option
- `disableTransitionOnChange` - Prevents flash during theme change

### Navigation (`src/components/nav.tsx`)
Theme picker is positioned in the sidebar footer alongside the tagline.

## Theme Variables

Themes are defined in `src/app/globals.css`:

```css
:root {
  /* Light mode colors */
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  /* ... */
}

.dark {
  /* Dark mode colors */
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  /* ... */
}
```

All colors use OKLCH format for better perceptual uniformity.

## Package Installed

```bash
npm install next-themes
```

**Version:** `next-themes` - Theme management for Next.js

## Usage

Users can click the theme icon in the bottom-right of the sidebar to:
1. Choose Light, Dark, or System theme
2. Theme persists across sessions (localStorage)
3. System theme automatically updates when OS preference changes

## Icons

- **Light:** ☀️ Sun icon
- **Dark:** 🌙 Moon icon
- **System:** 🖥️ Monitor icon

## Customization

### Change Default Theme
Edit `src/app/layout.tsx`:
```tsx
<ThemeProvider
  defaultTheme="dark"  // Change to "light", "dark", or "system"
  // ...
>
```

### Add More Theme Options
1. Add theme variables to `globals.css`
2. Update `ThemePicker` dropdown menu items
3. Add new theme colors to CSS

### Move Theme Picker Location
The `<ThemePicker />` component can be placed anywhere:
```tsx
<ThemePicker />
```

## Browser Support

- ✅ Chrome/Edge (modern)
- ✅ Firefox (modern)
- ✅ Safari (modern)
- ✅ Mobile browsers

## Performance

- Zero layout shift (uses `suppressHydrationWarning`)
- Theme applied before first paint (no flash)
- Lightweight (~2KB gzipped)

## Accessibility

- ✅ Keyboard navigable
- ✅ Screen reader friendly
- ✅ ARIA labels included
- ✅ Focus visible states

---

**Theme switching is now live!** 🎨
