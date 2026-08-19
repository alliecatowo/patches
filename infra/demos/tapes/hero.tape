# Recorded as @juan (see infra/demos/render.sh) against the live flagship node.
# Launch -> home feed -> open a thread -> reply -> notifications.
Output site/public/media/hero.gif

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

Type "gh"
Sleep 2s
Screenshot site/public/media/home.png
Sleep 500ms
Enter
Sleep 2s
Screenshot site/public/media/thread.png
Sleep 500ms
Type "r"
Sleep 1s
Type "this feels snappy even over a plain terminal 👋"
Sleep 1s
Ctrl+S
Sleep 2s
Type "gn"
Sleep 2s
Screenshot site/public/media/notifications.png
Sleep 500ms
Type "q"
Sleep 500ms
