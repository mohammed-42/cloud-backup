# Manual test checklist (acceptance tests)

These need a real Supabase project, so they must be run by you. Tick each one and
take a screenshot for your report. Use two different email addresses
(User A and User B) and two small text files.

Prepare `notes.txt` containing `Version 1`. Later edit it to contain `Version 2`.

| # | Test | Expected result | Pass |
|---|------|-----------------|------|
| 1 | Register User A, then log in | Dashboard opens, email shown top right | [ ] |
| 2 | Upload `notes.txt` (contains "Version 1") | Toast "Saved notes.txt as version 1", list shows v1 | [ ] |
| 3 | Edit file to "Version 2". Open **Versions** on notes.txt, click **Upload new version**, pick it | Toast says version 2 | [ ] |
| 4 | Open **Versions** | Two entries: Version 2 (Current) and Version 1, each with date and size | [ ] |
| 5 | Click **Download** on Version 1 | File `notes_v1.txt` downloads and contains "Version 1" | [ ] |
| 6 | Click **Restore** on Version 1 | Version 1 gets the "Current" badge; Version 2 is still listed | [ ] |
| 7 | Upload a second, different file | A second row appears, stats update | [ ] |
| 8 | Delete the second file and confirm | Row disappears. In Supabase -> Storage -> backups the files are gone, and the rows are gone from Table Editor | [ ] |
| 9 | Log out, register/log in as User B | User B sees the empty state, none of User A's files | [ ] |
| 10 | Refresh the browser as User A | Backups and versions are still there | [ ] |
| 11 | Run `npm run build` | Build finishes without errors | [ ] |

## Extra security checks (good for your viva)

- In Supabase -> Storage, confirm the `backups` bucket shows as **Private**.
- Run `sql/verify_rls.sql` in the SQL Editor and compare with the expected values in its comments.
- Try uploading an `.exe` file: the app must refuse it.
- Try uploading a file over 10 MB: the app must refuse it.
- Turn off your internet, try to upload: you should see a network error and no half-saved record.
