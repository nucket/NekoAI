# Community Pets

This directory is for community-contributed pet packs.

## Structure

Each pet pack should follow this layout:

```
pets-community/
└── your-pet-name/
    ├── pet.json       ← metadata, personality, animation definitions
    ├── sprites/       ← individual PNG frames (one file per frame)
    │   ├── idle1.png
    │   ├── idle2.png
    │   └── ...
    └── README.md      ← description, credits, license
```

## Before you start

Read **[docs/creating-a-pet.md](../docs/creating-a-pet.md)** — it covers the full `pet.json` format, sprite specifications, and how to test your pet locally.

## Submitting your pet

1. Fork the repository
2. Add your pet folder under `pets-community/`
3. Open a pull request with a short description and at least one screenshot

Community pets are not automatically included in the in-app manifest. Once reviewed and merged, the maintainers will add the pet to `pets/manifest.json` for inclusion in a future release.
