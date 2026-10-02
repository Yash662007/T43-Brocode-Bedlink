# BedLink design system

BedLink is a calm, safety-first operational UI for care coordination. The interface emphasizes a single urgent task at a time, large numerical values, clear text labels, and status that never relies on color alone.

## Tokens

The global BedLink design tokens in `src/styles.css` use the supplied light and dark values. Controls are 8px, cards 12px, and pills fully rounded. Typography uses the required Inter/system stack and 14–64px scale. The only shadow is a 0 1px 2px treatment.

## Accessibility

Body and supporting copy use high-contrast foreground tokens. Status badges pair an icon and text with their color. Focus uses a 3px accent outline with a 2px offset. All nurse actions are at least 48px; primary confirmation is 64px. Motion is disabled for reduced-motion users.
