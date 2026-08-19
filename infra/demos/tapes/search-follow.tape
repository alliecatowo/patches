# Recorded as @juan (see infra/demos/render.sh) against the live flagship node.
# Search for @allie, open her profile, follow her.
Output site/public/media/search-follow.gif

Set Shell "bash"
Set FontSize 16
Set Width 1260
Set Height 896
Set Theme "Catppuccin Mocha"
Set TypingSpeed 60ms
Set Padding 20

Type "node apps/tui/dist/cli.js"
Enter
Sleep 3s

Type "/"
Sleep 500ms
Type "allie"
Sleep 800ms
Enter
Sleep 1500ms
Enter
Sleep 2s
Type "f"
Sleep 2s
Type "q"
Sleep 500ms
