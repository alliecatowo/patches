# Recorded as @juan (see infra/demos/render.sh) against the live flagship node.
# `patches --help` / `patches whoami` / `patches ping`. The `patches` alias
# below stands in for the published binary (not on npm yet, A-046/P9-003) —
# it points at this checkout's built apps/tui/dist/cli.js.
Output site/public/media/cli.gif

Set Shell "bash"
Set FontSize 16
Set Width 1260
Set Height 896
Set Theme "Catppuccin Mocha"
Set TypingSpeed 60ms
Set Padding 20

Hide
Type "alias patches='node apps/tui/dist/cli.js'"
Enter
Sleep 300ms
Type "clear"
Enter
Show

Type "patches --help"
Enter
Sleep 3s
Type "patches whoami"
Enter
Sleep 2s
Type "patches ping"
Enter
Sleep 3s
