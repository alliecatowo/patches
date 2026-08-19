# Recorded as @juan (see infra/demos/render.sh) against the live flagship node.
# Grabs the two remaining screenshots (help overlay, plain mode) that don't
# belong in any of the narrative GIFs. The GIF output itself is not used
# anywhere (render.sh only cares about the Screenshot stills) but VHS
# requires an Output.
Output "/tmp/patches-demos-screens-scratch.gif"

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
Type "P"
Sleep 1s
Screenshot site/public/media/plain.png
Sleep 500ms
Type "P"
Sleep 500ms
Type "?"
Sleep 1s
Screenshot site/public/media/help.png
Sleep 500ms
Type "?"
Sleep 500ms
Type "q"
Sleep 500ms
