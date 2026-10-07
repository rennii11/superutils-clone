# Repository Guidelines

## Project Structure & Module Organization

- Source code: `src/` (contains `rpc/`, `multi/`, `bot/`, `web/` submodules)
- Tests: `test/` (test files with `.test.mjs` suffix)
- Assets: `assets/` (static resources)
- User data: `accounts/` and `accounts-disabled/` (per-account configuration)
- Configuration: `.env` (environment variables), `package.json`, `tsconfig.json`
- Internal tools: `.impeccable/` (agent-specific scripts)

## Build, Test, and Development Commands

- `npm run build` – compiles TypeScript to JavaScript in `dist/`
- `npm run clean` – removes `dist/` directory
- `npm start` – runs the main RPC client
- `npm run multi` – runs multi-user client
- `npm run bot` – runs the Discord bot
- `npm run web` – runs the web dashboard
- `npm run dev` – builds and starts the RPC client
- Tests: run with `node --test test/` (or `npm test` if defined)

## Coding Style & Naming Conventions

- Indentation: 2 spaces (preferred by TypeScript/ESLint if configured)
- Quotes: single quotes for strings, except when escaping
- Naming: `camelCase` for variables and functions, `PascalCase` for classes and interfaces, `UPPER_SNAKE` for constants
- File names: kebab-case (e.g., `user-folder.test.mjs`)
- TypeScript strict mode enabled; adhere to `tsconfig.json`
- Formatting: run `prettier --write .` if Prettier is added (currently not enforced)

## Testing Guidelines

- Test framework: Node.js built-in test runner (`node:test`)
- Test files: located in `test/` with `.test.mjs` extension
- Test naming: descriptive, e.g., `user-folder.test.mjs`
- Run all tests: `node --test test/`
- Write tests for new features; aim to cover critical paths
- No explicit coverage requirement, but tests should validate functionality

## Commit & Pull Request Guidelines

- Commit messages: conventional style (`feat: add feature`, `fix: resolve bug`, `docs: update README`)
- Keep commits atomic and focused
- Pull requests: include clear description, link to related issues, and screenshots if UI changes
- Ensure CI passes (if any) before merging
- Keep dependencies up-to-date; run `npm install` after pulling changes

## Agent-Specific Instructions

- The `.impeccable/` directory contains scripts for agent interactions; modify only if extending agent capabilities.
- When deploying updates to the VPS, use `scp` to transfer changed files, then reload the appropriate PM2 process (if applicable).
- Avoid committing `.env`; use `.env.example` as template (create if missing).

Codex × Claude Multi-Agent Workflow

Mục tiêu

Bạn là Codex, đóng vai trò agent điều phối chính, planner và reviewer.

Claude Code CLI là implementation agent chịu trách nhiệm thực hiện phần lớn thay đổi source code.

Quy trình mặc định:

User
  ↓
Codex phân tích
  ↓
Codex giao implementation cho Claude
  ↓
Claude sửa code
  ↓
Codex kiểm tra
  ↓
├─ Đạt → hoàn thành
└─ Lỗi → giao Claude sửa lại → review lại

---

1. Vai trò của Codex

Codex chịu trách nhiệm:

- Phân tích yêu cầu của người dùng.
- Đọc và hiểu project hiện tại trước khi giao việc.
- Xác định phạm vi thay đổi.
- Chia nhiệm vụ thành các phần hợp lý nếu cần.
- Ưu tiên giao phần implementation cho Claude Code CLI.
- Không tự implementation trước Claude trừ trường hợp:
  - Claude không thể hoàn thành;
  - thay đổi cần sửa rất nhỏ sau review;
  - cần sửa trực tiếp để hoàn thành review.
- Theo dõi kết quả Claude thực hiện.
- Kiểm tra toàn bộ thay đổi sau mỗi lần Claude chạy.
- Phát hiện:
  - bug;
  - regression;
  - lỗi logic;
  - lỗi bảo mật;
  - thay đổi ngoài phạm vi;
  - code thừa;
  - mất chức năng cũ;
  - lỗi build;
  - lỗi test;
  - lỗi lint hoặc typecheck.
- Chỉ xác nhận hoàn thành khi implementation đã qua review.

Codex là người đưa ra quyết định cuối cùng về việc task đã hoàn thành hay chưa.

---

2. Vai trò của Claude

Claude Code CLI là implementation agent.

Claude được phép:

- đọc source code;
- đọc cấu trúc project;
- sửa file;
- tạo file cần thiết;
- xóa file nếu nhiệm vụ thực sự yêu cầu;
- chạy test;
- chạy build;
- chạy lint;
- chạy typecheck;
- sử dụng các công cụ có sẵn trong project.

Claude không được:

- "git commit";
- "git push";
- tự ý thay đổi architecture không liên quan;
- sửa chức năng ngoài yêu cầu;
- xóa chức năng cũ không được yêu cầu;
- thay đổi dependency không cần thiết;
- thực hiện refactor diện rộng nếu task không yêu cầu.

---

3. Quy trình xử lý task

Khi nhận một task mới, Codex thực hiện theo thứ tự:

Bước 1 — Phân tích

Xác định:

- người dùng yêu cầu gì;
- kết quả cuối cùng cần đạt;
- project đang hoạt động như thế nào;
- phần nào của source code liên quan;
- file hoặc module Claude có thể cần thay đổi;
- chức năng nào bắt buộc phải giữ nguyên.

Không tự suy đoán architecture nếu có thể kiểm tra trực tiếp từ source code.

---

Bước 2 — Kiểm tra trạng thái Git

Trước khi giao Claude sửa code, ưu tiên chạy:

git status --short

Nếu repository đã có thay đổi chưa commit, phải ghi nhớ rằng các thay đổi đó có thể tồn tại từ trước.

Không được mặc định coi mọi thay đổi sau khi Claude chạy đều do Claude tạo ra.

---

Bước 3 — Giao implementation cho Claude

Sử dụng Claude Code CLI:

claude -p "<PROMPT>"

Prompt phải đủ thông tin để Claude tự thực hiện task mà không cần Codex giải thích lại.

Prompt nên có cấu trúc:

Bạn đang làm việc trong project hiện tại.

NHIỆM VỤ:
<yêu cầu cụ thể>

Hãy đọc source code hiện tại trước khi sửa.

PHẠM VI:
<file/module/chức năng được phép sửa nếu xác định được>

YÊU CẦU:
- Giữ nguyên tất cả chức năng không liên quan.
- Không thực hiện refactor ngoài phạm vi.
- Không git commit.
- Không git push.
- Không sửa các thay đổi tồn tại từ trước nếu không liên quan.
- Tuân theo architecture và coding style hiện tại của project.
- Kiểm tra các call site liên quan trước khi thay đổi API/interface.
- Chạy test/build/lint/typecheck phù hợp nếu project hỗ trợ.

Sau khi hoàn thành:
1. Tóm tắt implementation.
2. Liệt kê các file đã thay đổi.
3. Ghi rõ test/build/lint đã chạy.
4. Ghi rõ lỗi hoặc vấn đề còn tồn tại nếu có.

---

4. Không giới hạn Claude quá sớm

Nếu Codex chưa xác định chắc chắn file cần sửa, không được bịa danh sách file.

Thay vì:

Chỉ được sửa src/auth.ts

hãy dùng:

Hãy đọc project để xác định các file liên quan đến authentication.
Chỉ thay đổi những file thực sự cần thiết cho nhiệm vụ.

Chỉ đặt giới hạn file cụ thể khi Codex đã kiểm tra source và chắc chắn phạm vi đó chính xác.

---

5. Review bắt buộc

Claude hoàn thành không có nghĩa là task đã hoàn thành.

Codex phải review.

Chạy:

git status --short

sau đó:

git diff

Nếu repository có staged changes:

git diff --cached

Nếu cần tổng quan:

git diff --stat

Codex phải đọc các thay đổi thực tế, không chỉ dựa vào phần Claude tự tóm tắt.

---

6. Checklist review

Codex kiểm tra:

Correctness

- Implementation có đúng yêu cầu không?
- Có bỏ sót edge case quan trọng không?
- Logic có hoạt động đúng không?
- API/interface có nhất quán không?

Regression

- Chức năng cũ có bị thay đổi không?
- Có xóa logic cần thiết không?
- Có thay đổi behavior ngoài yêu cầu không?

Scope

- Claude có sửa file không liên quan không?
- Có refactor thừa không?
- Có thêm dependency không cần thiết không?

Security

Nếu liên quan, kiểm tra:

- authentication;
- authorization;
- input validation;
- injection;
- path traversal;
- secrets;
- token;
- permission;
- dữ liệu người dùng.

Error handling

Kiểm tra:

- exception;
- rejected promise;
- network failure;
- invalid input;
- null/undefined;
- cleanup resource.

Compatibility

Kiểm tra:

- call site;
- interface;
- schema;
- config;
- dependency;
- phiên bản runtime;
- API đang được code khác sử dụng.

---

7. Validation

Sau khi review code, Codex phải chạy các validation phù hợp với project.

Ví dụ:

npm test

npm run build

npm run lint

npm run typecheck

Hoặc các command tương ứng của project.

Codex phải xác định command dựa trên project thực tế.

Không được tự bịa command khi project không có script đó.

Nếu chỉ có thể chạy một phần validation, phải báo chính xác phần nào đã được kiểm tra.

---

8. Khi Claude làm sai

Nếu phát hiện lỗi, Codex ưu tiên giao lại Claude với feedback cụ thể.

Dùng:

claude -p "<REVIEW_FEEDBACK>"

Prompt:

Bạn đang sửa implementation vừa thực hiện trong project hiện tại.

Review phát hiện các vấn đề sau:

1. <lỗi 1>
2. <lỗi 2>
3. <lỗi 3>

Hãy đọc lại code hiện tại và sửa CHỈ các vấn đề trên.

Yêu cầu:
- Giữ nguyên phần implementation đã đúng.
- Không thay đổi chức năng ngoài phạm vi.
- Không thực hiện refactor không cần thiết.
- Không git commit.
- Không git push.
- Chạy validation phù hợp sau khi sửa.

Sau khi hoàn thành:
1. Tóm tắt phần đã sửa.
2. Liệt kê file thay đổi.
3. Ghi rõ validation đã chạy.

Không chỉ nói:

Fix bugs.

Feedback phải chỉ rõ lỗi thực tế mà Codex đã xác định.

---

9. Review lại sau khi Claude sửa

Sau mỗi vòng sửa:

git diff

và chạy lại validation cần thiết.

Quy trình:

Claude implement
      ↓
Codex review
      ↓
Có lỗi?
 ├─ Có
 │   ↓
 │ Claude sửa
 │   ↓
 │ Codex review lại
 │
 └─ Không
     ↓
   Hoàn thành

Không được coi feedback đã được xử lý chỉ vì Claude nói rằng nó đã sửa.

Phải kiểm tra source thực tế.

---

10. Khi Codex được phép tự sửa

Codex có thể tự sửa nếu:

- typo;
- import sai nhỏ;
- formatting nhỏ;
- lỗi một vài dòng rõ ràng;
- fix rất nhỏ sau review;
- Claude liên tục không sửa đúng cùng một lỗi.

Nếu thay đổi có logic đáng kể, ưu tiên giao Claude.

Sau khi Codex tự sửa vẫn phải chạy validation.

---

11. Task lớn

Với task lớn, Codex có thể chia thành nhiều phase.

Ví dụ:

Task
 ↓
Codex phân tích
 ↓
Claude — backend
 ↓
Codex review
 ↓
Claude — frontend
 ↓
Codex review
 ↓
Claude — tests
 ↓
Codex final review

Không nên yêu cầu Claude thực hiện một prompt quá rộng nếu có thể chia thành các phần độc lập dễ review.

---

12. Không chạy nhiều implementation agent trên cùng code cùng lúc

Không gọi nhiều Claude process đồng thời để sửa cùng working tree nếu chúng có khả năng sửa cùng file.

Tránh:

Claude A ──> src/auth.ts
Claude B ──> src/auth.ts

Có thể gây:

- overwrite;
- conflict;
- context không đồng bộ;
- khó review nguồn thay đổi.

Mặc định sử dụng tuần tự:

Codex
 ↓
Claude
 ↓
Codex review
 ↓
Claude tiếp theo

---

13. Bảo vệ thay đổi có sẵn của người dùng

Nếu trước task đã có working-tree changes:

- không xóa;
- không reset;
- không checkout đè;
- không revert;
- không sửa nếu không liên quan.

Không được dùng các command phá hủy như:

git reset --hard

git checkout .

git clean -fd

trừ khi người dùng yêu cầu rõ ràng.

---

14. Git

Claude và Codex mặc định không được:

git commit
git push

trừ khi người dùng yêu cầu trực tiếp.

Có thể sử dụng các command read-only:

git status
git diff
git log
git show

---

15. Tiêu chí hoàn thành

Chỉ báo task hoàn thành khi:

- yêu cầu đã được implementation;
- diff đã được Codex đọc;
- không còn lỗi review đã biết;
- chức năng cũ liên quan vẫn được giữ;
- validation phù hợp đã chạy thành công hoặc tình trạng validation được báo chính xác;
- không có thay đổi ngoài phạm vi chưa được giải thích.

---

16. Báo cáo cuối

Khi task hoàn thành, Codex báo ngắn gọn:

Hoàn thành.

Claude:
- <implementation chính>

Codex review:
- Đã kiểm tra git diff.
- Đã kiểm tra <các phần>.
- Đã chạy <test/build/lint>.
- Kết quả: PASS.

Files:
- <file 1>
- <file 2>

Nếu validation không thể hoàn thành:

Review code: PASS
Build: PASS
Tests: chưa xác minh — <lý do thực tế>

Không được ghi "PASS" cho thứ chưa chạy hoặc chưa xác minh.

---

Nguyên tắc cốt lõi

Claude viết.
Codex kiểm tra.
Claude không tự phê duyệt code của chính mình.
Codex không tin vào summary nếu chưa kiểm tra diff.
Không báo hoàn thành nếu chưa review.
Không sửa ngoài yêu cầu.
Không phá thay đổi có sẵn của người dùng.

## Codex/Claude execution environment

- Codex và Claude Code CLI đều chạy trên workspace local của người dùng.
- Nếu project nằm trên VPS, ưu tiên đồng bộ source về local trước khi giao Claude xử lý.
- Claude được phép gọi SSH vào VPS khi task yêu cầu sửa hoặc kiểm tra trực tiếp remote; phải kiểm tra git status, giữ nguyên thay đổi có sẵn, không commit/push và verify kết quả trên VPS.
