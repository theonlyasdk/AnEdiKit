---
name: tauri-feedback-loop
description: Develop and validate Tauri applications using automated UI tests and iterative feedback.
---

# Tauri Feedback Loop

When modifying the application:

1. Understand the requested change.
2. Inspect the existing implementation.
3. Modify the code.
4. Build the application.
5. Start the Tauri application.
6. Run the E2E test suite.
7. Read .agent-feedback/latest.json.
8. Inspect screenshots and logs when tests fail.
9. Fix the identified problems.
10. Run the tests again.
11. Repeat until the relevant tests pass.
12. Do not claim completion while known test failures remain.
