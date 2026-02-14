# Blocker Assignment Fix

## Problem

When Soumil said "I have solved the blocker that Anson was facing," the blocker wasn't being cleared from the database.

### Root Cause

The system was only fetching blockers **reported by** the current developer, not blockers **assigned to** them.

**Scenario:**
1. Anson reports a blocker: "Need GCP access"
2. Blocker is assigned to Soumil (to fix it)
3. Soumil resolves it and mentions in check-in
4. ❌ System doesn't see it because it only looks for blockers where `reportedById = Soumil`

**The blocker was:**
- `reportedById: Anson's ID`
- `assignedToId: Soumil's ID`

But the query was:
```typescript
where: {
  reportedById: checkIn.developerId, // Only Soumil's reported blockers
  status: "open",
}
```

This missed blockers assigned to Soumil!

---

## Solution

### 1. Fetch Both Types of Blockers

**Files Changed:**
- `src/app/api/checkins/process/route.ts`
- `src/app/api/checkins/context/route.ts`

**Before:**
```typescript
const openBlockers = await prisma.blocker.findMany({
  where: {
    reportedById: checkIn.developerId, // Only their reported blockers
    status: "open",
  },
});
```

**After:**
```typescript
const openBlockers = await prisma.blocker.findMany({
  where: {
    status: "open",
    OR: [
      { reportedById: checkIn.developerId }, // Blockers they reported
      { assignedToId: checkIn.developerId }, // Blockers assigned to them
    ],
  },
  select: {
    id: true,
    description: true,
    priority: true,
    reportedById: true,
    assignedToId: true,
  },
});
```

**Benefits:**
- ✅ Captures blockers reported by the developer
- ✅ Captures blockers assigned to the developer to fix
- ✅ Allows resolution of either type during check-ins

---

### 2. Enhanced Context API Response

**File:** `src/app/api/checkins/context/route.ts`

**Before:**
```typescript
openBlockers: openBlockers.map((b) => ({
  id: b.id,
  description: b.description,
  task: b.task?.name ?? null,
  priority: b.priority,
}))
```

**After:**
```typescript
openBlockers: openBlockers.map((b) => ({
  id: b.id,
  description: b.description,
  task: b.task?.name ?? null,
  priority: b.priority,
  reportedBy: b.reportedBy.name,           // ← NEW
  isAssignedToMe: b.assignedToId === developerId, // ← NEW
}))
```

**Benefits:**
- Shows who reported each blocker
- Indicates which blockers are assigned to the current developer
- Better context for the AI agent

---

### 3. Improved Voice Agent Prompts

**File:** `discord-bot/voice/prompts.ts`

**Updated contextual prompt to distinguish between blocker types:**

```typescript
2. **Open Blockers First** (if any): Ask about each by name.
   - For blockers assigned to them: "Did you fix [blocker]?"
   - For blockers they reported: "Is [blocker] still an issue?"
```

**Updated blocker list formatting:**
```typescript
const blockerList = openBlockers
  .map((b) => {
    const reportedBy = b.reportedBy ? ` reported by ${b.reportedBy}` : "";
    const assignedNote = b.isAssignedToMe ? " [ASSIGNED TO YOU]" : "";
    return `- [ID: ${b.id}] ${b.description} (${b.priority}${reportedBy}${assignedNote})`;
  })
  .join("\n");
```

**Example context:**
```
## Open Blockers (Reported or Assigned)
- [ID: abc123] Need GCP access (high reported by Anson [ASSIGNED TO YOU])
- [ID: xyz789] Database migration failing (critical reported by Soumil)
```

**Benefits:**
- Agent knows which blockers the developer should be fixing
- Agent asks different questions based on blocker type
- Clearer context for developers

---

### 4. Better Extraction Prompt

**File:** `src/lib/ai/prompts.ts`

**Enhanced rules for detecting resolved blockers:**

```
- CRITICAL: For resolvedBlockers, look for ANY mention of:
  * "I solved/fixed/resolved [blocker]"
  * "The [blocker] is done/cleared/unblocked"
  * "[Person]'s blocker is fixed"
  * Match the blocker ID from the provided context if you can identify it
- If the developer mentions resolving someone else's blocker
  (e.g., "I fixed Anson's blocker"), check if that blocker is in
  the Open Blockers list and include its ID
```

**Benefits:**
- Catches casual mentions of resolution
- Handles "I fixed X's blocker" pattern
- Better at matching blocker descriptions to IDs

---

## Expected Behavior Now

### Scenario 1: Developer Resolves Assigned Blocker

**Check-in:**
```
Agent: Did you fix Anson's GCP access issue?
User: Yes, I gave him access yesterday.
```

**Result:**
✅ Blocker marked as resolved
✅ `resolvedAt` timestamp set
✅ Check-in item created: "resolved_blocker"

### Scenario 2: Developer Mentions Resolution Casually

**Check-in:**
```
User: Yeah, I solved the blocker that Anson was facing.
```

**Result:**
✅ AI extraction detects "solved the blocker"
✅ Matches "Anson" to blocker reported by Anson
✅ Includes blocker ID in resolvedBlockers
✅ Blocker marked as resolved

### Scenario 3: Developer Resolves Own Blocker

**Check-in:**
```
Agent: Is the database migration blocker still an issue?
User: Nope, I fixed it this morning.
```

**Result:**
✅ Blocker matched by ID from context
✅ Marked as resolved
✅ Clean database state

---

## Updated TypeScript Interfaces

### DeveloperContext
```typescript
openBlockers: {
  id?: string;
  description: string;
  task: string | null;
  priority: string;
  reportedBy?: string;        // ← NEW
  isAssignedToMe?: boolean;   // ← NEW
}[];
```

---

## Testing Checklist

### Test Case 1: Assigned Blocker Resolution
- [ ] Create blocker reported by User A
- [ ] Assign blocker to User B
- [ ] User B does check-in and says "I fixed A's blocker"
- [ ] Verify blocker is marked as resolved
- [ ] Verify resolvedAt timestamp is set

### Test Case 2: Self-Reported Blocker Resolution
- [ ] User A reports blocker during check-in
- [ ] Next check-in, User A says "That's fixed now"
- [ ] Verify blocker is marked as resolved

### Test Case 3: Multiple Blockers
- [ ] User has 2 blockers: 1 reported by them, 1 assigned to them
- [ ] Verify both show up in context
- [ ] Verify both can be resolved in same check-in

### Test Case 4: Casual Mentions
- [ ] User says "I helped Anson with his GCP issue"
- [ ] Verify AI extraction catches this
- [ ] Verify blocker is resolved

---

## Database Query Changes

### Process Route Query
```sql
-- Before
SELECT * FROM Blocker
WHERE reportedById = ? AND status = 'open'

-- After
SELECT * FROM Blocker
WHERE status = 'open'
  AND (reportedById = ? OR assignedToId = ?)
```

### Context Route Query
```sql
-- Same change, plus includes reportedBy relation
SELECT b.*, rb.name as reportedByName
FROM Blocker b
LEFT JOIN Developer rb ON b.reportedById = rb.id
WHERE b.status = 'open'
  AND (b.reportedById = ? OR b.assignedToId = ?)
ORDER BY b.createdAt DESC
```

---

## Backwards Compatibility

✅ **Fully backwards compatible**
- Existing blockers without assignedToId still work
- Query uses `OR` so both conditions are optional
- No database migration required
- No breaking changes to API

---

## Summary

The fix ensures blockers are tracked and resolved correctly regardless of whether the developer:
1. ✅ Reported the blocker themselves
2. ✅ Has the blocker assigned to them to fix

**Key improvements:**
- Fetches both reported and assigned blockers
- Agent asks appropriate questions based on blocker type
- AI extraction better at detecting resolution mentions
- UI shows who reported each blocker
- Clear indication of assigned vs reported blockers

**Result:** Blockers are now properly cleared from the database when developers resolve them! 🎉
