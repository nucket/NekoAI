# Community Pets

This directory is for community-contributed pet packs.

## Structure

Each pet pack should follow this layout:

```
pets-community/
  your-pet-name/
    pet.json       # metadata + animation definitions
    sprites.png    # sprite sheet
    preview.png    # 128x128 preview image
    README.md      # description, credits, license
```

## Submitting a Pet

Open a pull request adding your pet folder under `pets-community/`.
Make sure your `pet.json` follows the schema in `src/pets/index.ts`.
