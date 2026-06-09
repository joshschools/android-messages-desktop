# AUR packaging

[`PKGBUILD`](PKGBUILD) builds `android-messages-desktop-bin`, which installs the
prebuilt AppImage from a GitHub release. It extracts the AppImage into `/opt`
(so no FUSE is needed at runtime), adds a `/usr/bin` launcher, and installs the
desktop entry and icons.

## Test locally
```bash
cd packaging/aur
# Update checksums for the current release:
updpkgsums
# Build and install:
makepkg -si
```

## Bump for a new release
1. Set `pkgver` (and reset `pkgrel=1`) to match the released `vX.Y.Z` tag.
2. Run `updpkgsums` to refresh `sha256sums`.
3. (Recommended) Put your GPG key fingerprint in `validpgpkeys=(...)` so the
   AppImage's `.asc` signature is verified at build time.
4. Regenerate `.SRCINFO`: `makepkg --printsrcinfo > .SRCINFO`.

## Publish to the AUR
```bash
# One-time: have an AUR account with your SSH key added.
git clone ssh://aur@aur.archlinux.org/android-messages-desktop-bin.git
cd android-messages-desktop-bin
cp /path/to/PKGBUILD .
makepkg --printsrcinfo > .SRCINFO
git add PKGBUILD .SRCINFO
git commit -m "Initial import: android-messages-desktop-bin 4.0.0"
git push
```

> Notes
> - `depends` lists the common Electron runtime libraries; adjust if the app
>   fails to start on a minimal system (e.g. add `libxss`, `libappindicator-gtk3`).
> - The release must contain `android-messages-desktop-${pkgver}.AppImage`
>   (and its `.asc` if you enable signature verification), which the
>   `linux.artifactName` in `package.json` produces.
