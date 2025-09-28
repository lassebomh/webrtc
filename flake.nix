
{
  description = "Horizon development environment";

  inputs = {
    flake-utils.url = "github:numtide/flake-utils";
    nixpkgs.url = "github:NixOS/nixpkgs";
  };

  outputs = { self, flake-utils, nixpkgs, } @ inputs:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      with pkgs; {
        devShells.default = mkShell {
          packages = [
            nodejs_24
            pnpm
          ];
        };
      }
    );
}
