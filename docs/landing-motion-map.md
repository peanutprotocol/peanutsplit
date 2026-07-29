# Landing motion map

The landing page tells one causal story. Motion explains where a room link goes
and what happens next; it does not decorate empty time.

| Beat               | Trigger                              | Movement                                                                                         | Feedback                                                                   | Final frame                                         |
| ------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | --------------------------------------------------- |
| Group-chat handoff | First page view                      | Channel doodles arrive, the question gets a reply, the room card is shared, then the group joins | None. Passive motion stays silent and never vibrates                       | Complete chat with the shared room and joined group |
| Real room form     | First focus, key, or pointer gesture | The illustrative handoff settles immediately so the real form owns attention                     | Existing picker ticks; room creation uses the shared success/error cues    | Stable form and complete handoff                    |
| Product proof      | Each scene enters the viewport       | Copy rises once; the proof object follows with a short spring                                    | None. Scrolling is not an action                                           | Fully readable proof scene                          |
| Progress rail      | Rail enters the viewport             | Four milestones arrive in order                                                                  | None                                                                       | All milestones visible                              |
| Room examples      | Example grid enters the viewport     | Four room tiles arrive in a short stagger                                                        | None                                                                       | Stable four-room grid                               |
| Read-more fold     | A summary is tapped                  | Body opens once; the plus turns into an x                                                        | `blip` on open, `tick` on close, through `useFeedback()`                   | Open content remains still and readable             |
| Recent room        | A remembered room is tapped          | Existing pressed state, then navigation                                                          | `whoosh` through `useFeedback()`                                           | The room                                            |
| Final CTA          | CTA is tapped                        | Existing pressed/squash state, then navigation                                                   | One `whoosh`; the nested button haptic is disabled to prevent a double tap | Room creator                                        |

## Quiet modes

- `useMotionAllowed()` combines the app setting with a live
  `prefers-reduced-motion` media query.
- OS reduced motion and the in-app animations-off class both force proof,
  examples, folds, and the final CTA into their complete frame.
- CSS supplies the same complete frame before hydration, so content never starts
  hidden for a reduced-motion reader.
- Sound and haptics only occur inside real gestures and remain independently
  gated by their existing settings.

## Guardrails

- Every sequence is one-shot; nothing loops in the background.
- Transforms do not participate in layout and must not widen the document.
- The hero headline, both real inputs, and the primary CTA remain inside the
  agreed mobile and desktop first folds.
- Playwright owns the reduced-motion, overflow, final-state, keyboard, and
  supported-viewport contracts. Real-device review still owns subjective feel
  and performance.
