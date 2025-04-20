{pkgs}: {
  deps = [
    pkgs.chromium
    pkgs.pdftk
    pkgs.qpdf
    pkgs.jq
    pkgs.postgresql
  ];
}
