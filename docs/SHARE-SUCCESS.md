# Sharing is a success moment

**Decision:** approved 2026-08-03.

A completed room share is Peanut Split's key business success event. It is the
viral handoff that brings the product into the group.

This is separate from the product aha moment: the first shared expense that
produces a balance between people. Either event may happen first.

## UX rule

Sharing is important and encouraged, but never required.

- If no expense exists, emphasize Share after room and optional roster setup.
- If an expense exists, emphasize Share immediately after the first balance
  appears.
- Keep Share available in the room header and reinforce it in the empty room
  and post-expense success state.
- Always provide Skip, Close, or an equivalent path into the room.
- Do not block expense entry, room access, or later editing on a share.

The prompt should match what exists. An empty room can be shared as setup; a
populated room should show the context it has earned.

The private invite payload is text plus the exact room URL, never an attached
file. The URL's room-specific Open Graph image supplies the visual in receivers
that unfurl links without risking an image-only delivery that drops the room
credential. Public achievement and recap images are separate, honestly labelled
file actions and never carry the room URL.

## Measurement rule

`share_completed` is the success event: the native share resolves or a real
clipboard copy succeeds. Merely presenting or opening the share surface is not
success.

Measure the opportunity surface and order separately from completion so we can
distinguish room-ready sharing from post-aha sharing. Keep the existing
identifier-free analytics boundary: never send a room slug, name, description,
or amount.
