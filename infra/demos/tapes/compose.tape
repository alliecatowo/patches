# Recorded as @allie (see infra/demos/render.sh) against the live flagship node.
# Compose a new post, submit, land on own profile.
Output site/public/media/compose.gif

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

Type "c"
Sleep 1s
Type "hello from the terminal 🚀"
Sleep 1s
Ctrl+S
Sleep 2s
Screenshot site/public/media/profile.png
Sleep 500ms
Type "q"
Sleep 500ms
