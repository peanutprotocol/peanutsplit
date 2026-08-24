# Generated data-model inventory

<!-- GENERATED FILE. Run `pnpm docs:generate`; do not hand-edit. -->

Source: `apps/web/prisma/schema.prisma`  
Input SHA-256: `a486551b2365dab7eb7a451ee4c0ccb8944a51f9e163bac5fddc0eb8bd7dd4b1`

PostgreSQL namespace: `split`  
Models: 15  
Split modes: `EQUAL`, `EXACT`, `PERCENTAGE`, `SHARES`

## Room

| Field                         | Prisma type          | Attributes                           |
| ----------------------------- | -------------------- | ------------------------------------ |
| `id`                          | `String`             | @id @default(uuid())                 |
| `slug`                        | `String`             | @unique                              |
| `name`                        | `String`             | —                                    |
| `emoji`                       | `String?`            | —                                    |
| `currency`                    | `String`             | // display/settle currency, ISO 4217 |
| `coverUrl`                    | `String?`            | —                                    |
| `theme`                       | `String?`            | —                                    |
| `locale`                      | `String?`            | —                                    |
| `firstSharedBalanceExpenseId` | `String?`            | —                                    |
| `createdAt`                   | `DateTime`           | @default(now())                      |
| `members`                     | `Member[]`           | —                                    |
| `expenses`                    | `Expense[]`          | —                                    |
| `settlements`                 | `Settlement[]`       | —                                    |
| `auditEvents`                 | `RoomAuditEvent[]`   | —                                    |
| `importBatches`               | `ImportBatch[]`      | —                                    |
| `feedbackReports`             | `FeedbackReport[]`   | —                                    |
| `installHandoffs`             | `InstallHandoff[]`   | —                                    |
| `pushSubscriptions`           | `PushSubscription[]` | —                                    |
| `notificationSends`           | `NotificationSend[]` | —                                    |

## FeedbackReport

| Field                  | Prisma type | Attributes                                                       |
| ---------------------- | ----------- | ---------------------------------------------------------------- |
| `id`                   | `String`    | @id @default(uuid())                                             |
| `roomId`               | `String`    | —                                                                |
| `message`              | `String`    | —                                                                |
| `diagnostics`          | `Json?`     | —                                                                |
| `roomSnapshot`         | `Json?`     | —                                                                |
| `screenshot`           | `Bytes?`    | —                                                                |
| `screenshotMimeType`   | `String?`   | —                                                                |
| `screenshotByteLength` | `Int?`      | —                                                                |
| `screenshotWidth`      | `Int?`      | —                                                                |
| `screenshotHeight`     | `Int?`      | —                                                                |
| `createdAt`            | `DateTime`  | @default(now())                                                  |
| `room`                 | `Room`      | @relation(fields: [roomId], references: [id], onDelete: Cascade) |

## RoomAuditEvent

| Field             | Prisma type | Attributes                                                         |
| ----------------- | ----------- | ------------------------------------------------------------------ |
| `id`              | `BigInt`    | @id @default(autoincrement())                                      |
| `roomId`          | `String`    | —                                                                  |
| `action`          | `String`    | —                                                                  |
| `subjectType`     | `String?`   | —                                                                  |
| `subjectId`       | `String?`   | —                                                                  |
| `actorDeviceHash` | `String?`   | // SHA-256(roomId + device cookie); the raw cookie is never stored |
| `deviceOrdinal`   | `Int?`      | // first device seen in this room is 1 ("Device A")                |
| `actorMemberId`   | `String?`   | —                                                                  |
| `actorMemberName` | `String?`   | // immutable display snapshot                                      |
| `before`          | `Json?`     | —                                                                  |
| `after`           | `Json?`     | —                                                                  |
| `detail`          | `Json?`     | —                                                                  |
| `createdAt`       | `DateTime`  | @default(now())                                                    |
| `room`            | `Room`      | @relation(fields: [roomId], references: [id], onDelete: Restrict)  |

## Member

| Field                | Prisma type          | Attributes                                                                         |
| -------------------- | -------------------- | ---------------------------------------------------------------------------------- |
| `id`                 | `String`             | @id @default(uuid())                                                               |
| `roomId`             | `String`             | —                                                                                  |
| `name`               | `String`             | —                                                                                  |
| `token`              | `String`             | @unique // stable server-issued secret, returned when a device selects this member |
| `avatar`             | `String?`            | —                                                                                  |
| `avatarPalette`      | `String?`            | —                                                                                  |
| `userId`             | `String?`            | // future account-linking hook                                                     |
| `provisional`        | `Boolean`            | @default(false)                                                                    |
| `createdAt`          | `DateTime`           | @default(now())                                                                    |
| `removedAt`          | `DateTime?`          | // non-null = Former for future activity; ledger identity remains durable          |
| `room`               | `Room`               | @relation(fields: [roomId], references: [id], onDelete: Cascade)                   |
| `user`               | `User?`              | @relation(fields: [userId], references: [id], onDelete: SetNull)                   |
| `paidExpenses`       | `Expense[]`          | @relation("ExpensePaidBy")                                                         |
| `createdExpenses`    | `Expense[]`          | @relation("ExpenseCreatedBy")                                                      |
| `shares`             | `ExpenseShare[]`     | —                                                                                  |
| `reactions`          | `ExpenseReaction[]`  | —                                                                                  |
| `settlementsFrom`    | `Settlement[]`       | @relation("SettlementFrom")                                                        |
| `settlementsTo`      | `Settlement[]`       | @relation("SettlementTo")                                                          |
| `createdSettlements` | `Settlement[]`       | @relation("SettlementCreatedBy")                                                   |
| `pushSubscriptions`  | `PushSubscription[]` | —                                                                                  |
| `installHandoffs`    | `InstallHandoff[]`   | —                                                                                  |

## InstallHandoff

| Field             | Prisma type | Attributes                                                         |
| ----------------- | ----------- | ------------------------------------------------------------------ |
| `tokenHash`       | `String`    | @id @db.Char(64)                                                   |
| `roomId`          | `String`    | —                                                                  |
| `memberId`        | `String?`   | —                                                                  |
| `memberTokenHash` | `String?`   | @db.Char(64)                                                       |
| `createdAt`       | `DateTime`  | @default(now())                                                    |
| `expiresAt`       | `DateTime`  | —                                                                  |
| `room`            | `Room`      | @relation(fields: [roomId], references: [id], onDelete: Cascade)   |
| `member`          | `Member?`   | @relation(fields: [memberId], references: [id], onDelete: SetNull) |

## Expense

| Field             | Prisma type         | Attributes                                                                                |
| ----------------- | ------------------- | ----------------------------------------------------------------------------------------- |
| `id`              | `String`            | @id @default(uuid())                                                                      |
| `roomId`          | `String`            | —                                                                                         |
| `description`     | `String`            | —                                                                                         |
| `amountMinor`     | `BigInt`            | // in `currency`                                                                          |
| `currency`        | `String`            | // may differ from the room currency                                                      |
| `baseAmountMinor` | `BigInt`            | —                                                                                         |
| `fxRate`          | `Decimal`           | @db.Decimal(24, 12)                                                                       |
| `paidById`        | `String`            | —                                                                                         |
| `createdById`     | `String?`           | // attribution from X-Member-Token — never authorization                                  |
| `splitMode`       | `SplitMode`         | —                                                                                         |
| `date`            | `DateTime`          | @default(now())                                                                           |
| `category`        | `String?`           | —                                                                                         |
| `createdAt`       | `DateTime`          | @default(now())                                                                           |
| `deletedAt`       | `DateTime?`         | // soft delete → 6s Undo                                                                  |
| `importBatchId`   | `String?`           | —                                                                                         |
| `importRowIndex`  | `Int?`              | —                                                                                         |
| `room`            | `Room`              | @relation(fields: [roomId], references: [id], onDelete: Cascade)                          |
| `importBatch`     | `ImportBatch?`      | @relation(fields: [importBatchId], references: [id], onDelete: Restrict)                  |
| `paidBy`          | `Member`            | @relation("ExpensePaidBy", fields: [paidById], references: [id], onDelete: Cascade)       |
| `createdBy`       | `Member?`           | @relation("ExpenseCreatedBy", fields: [createdById], references: [id], onDelete: SetNull) |
| `shares`          | `ExpenseShare[]`    | —                                                                                         |
| `reactions`       | `ExpenseReaction[]` | —                                                                                         |

## ImportBatch

| Field               | Prisma type | Attributes                                                       |
| ------------------- | ----------- | ---------------------------------------------------------------- |
| `id`                | `String`    | @id @default(uuid())                                             |
| `roomId`            | `String`    | —                                                                |
| `fingerprint`       | `String`    | —                                                                |
| `sourceFingerprint` | `String?`   | —                                                                |
| `importedAt`        | `DateTime`  | @db.Timestamp(3)                                                 |
| `expenseCount`      | `Int`       | —                                                                |
| `addedMemberCount`  | `Int`       | —                                                                |
| `room`              | `Room`      | @relation(fields: [roomId], references: [id], onDelete: Cascade) |
| `expenses`          | `Expense[]` | —                                                                |

## ExpenseReaction

| Field       | Prisma type | Attributes                                                          |
| ----------- | ----------- | ------------------------------------------------------------------- |
| `id`        | `String`    | @id @default(uuid())                                                |
| `expenseId` | `String`    | —                                                                   |
| `memberId`  | `String`    | —                                                                   |
| `emoji`     | `String`    | —                                                                   |
| `createdAt` | `DateTime`  | @default(now())                                                     |
| `expense`   | `Expense`   | @relation(fields: [expenseId], references: [id], onDelete: Cascade) |
| `member`    | `Member`    | @relation(fields: [memberId], references: [id], onDelete: Cascade)  |

## ExpenseShare

| Field                | Prisma type | Attributes                                                          |
| -------------------- | ----------- | ------------------------------------------------------------------- |
| `id`                 | `String`    | @id @default(uuid())                                                |
| `expenseId`          | `String`    | —                                                                   |
| `memberId`           | `String`    | —                                                                   |
| `amountMinor`        | `BigInt`    | // ALWAYS in room currency (post-FX)                                |
| `enteredAmountMinor` | `BigInt?`   | // EXACT mode: verbatim in expense currency — no-drift re-save      |
| `splitWeight`        | `BigInt?`   | // PERCENTAGE: basis points; SHARES: relative integer weight        |
| `expense`            | `Expense`   | @relation(fields: [expenseId], references: [id], onDelete: Cascade) |
| `member`             | `Member`    | @relation(fields: [memberId], references: [id], onDelete: Cascade)  |

## Settlement

| Field         | Prisma type | Attributes                                                                                   |
| ------------- | ----------- | -------------------------------------------------------------------------------------------- |
| `id`          | `String`    | @id @default(uuid())                                                                         |
| `roomId`      | `String`    | —                                                                                            |
| `fromId`      | `String`    | —                                                                                            |
| `toId`        | `String`    | —                                                                                            |
| `createdById` | `String?`   | // attribution only                                                                          |
| `amountMinor` | `BigInt`    | // room currency                                                                             |
| `method`      | `String?`   | // "cash" \| "bank" \| "peanut" \| null                                                      |
| `note`        | `String?`   | —                                                                                            |
| `receiptUrl`  | `String?`   | // pasted documentation only; never fetched or verified                                      |
| `createdAt`   | `DateTime`  | @default(now())                                                                              |
| `deletedAt`   | `DateTime?` | —                                                                                            |
| `room`        | `Room`      | @relation(fields: [roomId], references: [id], onDelete: Cascade)                             |
| `from`        | `Member`    | @relation("SettlementFrom", fields: [fromId], references: [id], onDelete: Cascade)           |
| `to`          | `Member`    | @relation("SettlementTo", fields: [toId], references: [id], onDelete: Cascade)               |
| `createdBy`   | `Member?`   | @relation("SettlementCreatedBy", fields: [createdById], references: [id], onDelete: SetNull) |

## FxRate

| Field       | Prisma type | Attributes                                                   |
| ----------- | ----------- | ------------------------------------------------------------ |
| `id`        | `String`    | @id @default(uuid())                                         |
| `base`      | `String`    | —                                                            |
| `quote`     | `String`    | —                                                            |
| `rate`      | `Decimal`   | @db.Decimal(24, 12) // units of `base` per 1 unit of `quote` |
| `fetchedAt` | `DateTime`  | @default(now())                                              |

## PushSubscription

| Field        | Prisma type | Attributes                                                         |
| ------------ | ----------- | ------------------------------------------------------------------ |
| `id`         | `String`    | @id @default(uuid())                                               |
| `roomId`     | `String`    | —                                                                  |
| `memberId`   | `String`    | —                                                                  |
| `endpoint`   | `String`    | // push-service URL; the host is allowlisted at write time         |
| `p256dh`     | `String`    | —                                                                  |
| `auth`       | `String`    | —                                                                  |
| `userAgent`  | `String?`   | —                                                                  |
| `createdAt`  | `DateTime`  | @default(now())                                                    |
| `lastSeenAt` | `DateTime`  | @default(now())                                                    |
| `room`       | `Room`      | @relation(fields: [roomId], references: [id], onDelete: Cascade)   |
| `member`     | `Member`    | @relation(fields: [memberId], references: [id], onDelete: Cascade) |

## NotificationSend

| Field            | Prisma type | Attributes                                                       |
| ---------------- | ----------- | ---------------------------------------------------------------- |
| `id`             | `String`    | @id @default(uuid())                                             |
| `roomId`         | `String`    | —                                                                |
| `template`       | `String`    | —                                                                |
| `dayKey`         | `String`    | // UTC yyyy-mm-dd                                                |
| `dedupeKey`      | `String`    | @unique                                                          |
| `status`         | `String`    | // claimed \| sent \| failed                                     |
| `errorCode`      | `String?`   | —                                                                |
| `openedCount`    | `Int`       | @default(0)                                                      |
| `dismissedCount` | `Int`       | @default(0)                                                      |
| `createdAt`      | `DateTime`  | @default(now())                                                  |
| `room`           | `Room`      | @relation(fields: [roomId], references: [id], onDelete: Cascade) |

## User

| Field       | Prisma type     | Attributes           |
| ----------- | --------------- | -------------------- |
| `id`        | `String`        | @id @default(uuid()) |
| `createdAt` | `DateTime`      | @default(now())      |
| `accounts`  | `AuthAccount[]` | —                    |
| `members`   | `Member[]`      | —                    |

## AuthAccount

| Field        | Prisma type | Attributes                                                       |
| ------------ | ----------- | ---------------------------------------------------------------- |
| `id`         | `String`    | @id @default(uuid())                                             |
| `userId`     | `String`    | —                                                                |
| `provider`   | `String`    | —                                                                |
| `providerId` | `String`    | —                                                                |
| `createdAt`  | `DateTime`  | @default(now())                                                  |
| `user`       | `User`      | @relation(fields: [userId], references: [id], onDelete: Cascade) |
