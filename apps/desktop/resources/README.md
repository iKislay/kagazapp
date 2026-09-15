# Bundled resources

Files here are copied into the installed app's `resources/` directory
(outside the asar archive) so they can be spawned as executables.

## SumatraPDF.exe — required from Phase 6

Not committed: it is a third-party binary and does not belong in git history.

Download the **64-bit portable** build from
<https://www.sumatrapdfreader.org/download-free-pdf-viewer>, rename it to
`SumatraPDF.exe`, and drop it here before running `pnpm package`.

The print executor calls it as:

```
SumatraPDF.exe -print-to "<printer>" -print-settings "2x,duplex,color,1-5" -silent <file.pdf>
```
