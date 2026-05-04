---
name: New Pet Submission
about: Propose a new community pet
title: '[PET] '
labels: community-pet
assignees: ''
---

## Pet name

What is your pet called?

## Description

Brief description of the pet's appearance and personality.

## Preview

Attach a GIF or screenshot of the pet animations.

## Checklist

- [ ] `pet.json` is valid and includes all required animations (idle, walk_right, walk_left, sleep)
- [ ] All sprites are PNG with transparent background (RGBA)
- [ ] Sprites are 32×32 px
- [ ] `system_prompt` in `pet.json` is under 500 characters
- [ ] Folder is placed in `pets-community/your-pet-name/`
- [ ] I have tested the pet locally with `npm run tauri dev`

## Notes

Anything else the reviewers should know.
