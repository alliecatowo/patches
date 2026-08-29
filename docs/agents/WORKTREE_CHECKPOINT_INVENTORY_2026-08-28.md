# Worktree checkpoint inventory — 2026-08-28

This is the recovery inventory for the worktree cleanup performed on 2026-08-28. The audit found 63 linked auxiliary worktrees: 29 dirty and 34 clean. All 29 dirty branches were saved in 30 WIP commits with subject `chore: checkpoint worktree`; all 63 linked auxiliary worktrees were then removed. The checkpoint commits used `--no-verify`. They are unverified WIP snapshots, not reviewed, merged, or ready to ship.

Former paths in the tables are relative to `/home/allie/develop/patches-agent-wt/`. The main checkout at `/home/allie/develop/patches` remained registered throughout.

## Dirty worktrees saved and removed

| Former path          | Branch                                  | Old HEAD                                   | New HEAD                                   | Checkpoint commit(s)                                                                   | Paths saved | Removal |
| -------------------- | --------------------------------------- | ------------------------------------------ | ------------------------------------------ | -------------------------------------------------------------------------------------- | ----------: | ------- |
| `1787761661-1818126` | `feat/b180-b184-web-remote-attribution` | `4885d9a179720c2f481fa56e30bfd6b2a0fe4ea9` | `4501bf613a6fa895d720815f13b33c06e5013bbd` | `4501bf613a6fa895d720815f13b33c06e5013bbd`                                             |           2 | removed |
| `1787761684-1819007` | `chore/b126-dead-filter-scope`          | `e696caa660b53143007c6cb803540761d3d9f7b3` | `084bac3b49684e67c5d746ca5c9de4e2a4c0c0bb` | `084bac3b49684e67c5d746ca5c9de4e2a4c0c0bb`                                             |           2 | removed |
| `1787762485-1863536` | `fix/b193-mailbox-drain-stops-on-error` | `f4e765a5c3ad345ac6596d04b225553ec5db6681` | `fd44bf4b625d3e2eade509d37fb6c382b78ff089` | `fd44bf4b625d3e2eade509d37fb6c382b78ff089`                                             |           4 | removed |
| `1787790593-2387047` | `agent/wt-1787790593-2387047`           | `46e72a81fae7ed0225583d214227932663ba1f08` | `1267a839326414491fc66b433761f75618c88438` | `1267a839326414491fc66b433761f75618c88438`                                             |           8 | removed |
| `1787790712-2390562` | `agent/wt-1787790712-2390562`           | `46e72a81fae7ed0225583d214227932663ba1f08` | `7e1daa90f8bf0c8189541da54a9b63135dbb1fe8` | `7e1daa90f8bf0c8189541da54a9b63135dbb1fe8`                                             |           5 | removed |
| `1787790835-2394925` | `agent/wt-1787790835-2394925`           | `46e72a81fae7ed0225583d214227932663ba1f08` | `07d4ca6d0b18d737efaea45e842089418edc9025` | `07d4ca6d0b18d737efaea45e842089418edc9025`                                             |           7 | removed |
| `1787791776-2415453` | `agent/wt-1787791776-2415453`           | `e1601357e0521eaa62a72ea82fdea27db74d7625` | `5fb1181c0d9333a431f51fab747b95b387f2627d` | `5fb1181c0d9333a431f51fab747b95b387f2627d`                                             |          24 | removed |
| `1787791866-2418098` | `agent/wt-1787791866-2418098`           | `6dd06cf5ba23502d49444e6313ed6729aca5f41a` | `0d35a6403085e97d0e19372d6c3feaf29011a6b8` | `0d35a6403085e97d0e19372d6c3feaf29011a6b8`                                             |           6 | removed |
| `1787796976-2548548` | `agent/wt-1787796976-2548548`           | `f7fdac5eb649b8113c1b45e04b8cac46561e5c65` | `107550e2dc69918099dd4e51ca3152069e232a24` | `8284b30cfb79b21e814d1e06f9ce7f855ff922f5`, `107550e2dc69918099dd4e51ca3152069e232a24` |           9 | removed |
| `1787799442-2618812` | `agent/wt-1787799442-2618812`           | `6465643ed3c4fa7549f9ea5fdb3a4b7852621cdd` | `f3c9b030b62d68610b0890b0b0e184c8f03449c2` | `f3c9b030b62d68610b0890b0b0e184c8f03449c2`                                             |           2 | removed |
| `1787799461-2619350` | `agent/wt-1787799461-2619350`           | `6465643ed3c4fa7549f9ea5fdb3a4b7852621cdd` | `68463941baa135010f924bbee3e391af9c4fc300` | `68463941baa135010f924bbee3e391af9c4fc300`                                             |           4 | removed |
| `1787799486-2620104` | `agent/wt-1787799486-2620104`           | `6465643ed3c4fa7549f9ea5fdb3a4b7852621cdd` | `7f201c2c2edea0f72f96dc6cbdc0dadecea50721` | `7f201c2c2edea0f72f96dc6cbdc0dadecea50721`                                             |           2 | removed |
| `1787799519-2620757` | `agent/wt-1787799519-2620757`           | `6465643ed3c4fa7549f9ea5fdb3a4b7852621cdd` | `76ba08411343ec8938a6c9813d0b0a004c69350e` | `76ba08411343ec8938a6c9813d0b0a004c69350e`                                             |           7 | removed |
| `1787866335-3711991` | `fix/e2ee-consume-one-time-prekey`      | `fc8d92d1c3fcb20321d77d64b3963277a3721f2d` | `214233394f516b136d82f03871a7fcc489354f3f` | `214233394f516b136d82f03871a7fcc489354f3f`                                             |           2 | removed |
| `1787866335-3711992` | `test/e2ee-setup-block-vector`          | `ead493d458ca60fe9c4285d9fcd893d1b7a2e2b7` | `c2b9838d97c7e75a959b96fce92434a8b65fc22e` | `c2b9838d97c7e75a959b96fce92434a8b65fc22e`                                             |           2 | removed |
| `1787869136-3797081` | `test/e2ee-rotation-against-node`       | `4478ce81e4fb48bedaf743ee9fa28532544fe908` | `99a9be2260f50930a9c8eb55ec42fffda1c472d5` | `99a9be2260f50930a9c8eb55ec42fffda1c472d5`                                             |           1 | removed |
| `1787879519-3939279` | `test/web-e2e-needs-authority-rotate`   | `70c75ceec19998705e0a5d1513961d1e5d23171e` | `0d694d4437cea0b192415ff5833d27a67d8f79b4` | `0d694d4437cea0b192415ff5833d27a67d8f79b4`                                             |           2 | removed |
| `1787879925-3954441` | `fix/e2ee-rotate-from-legacy-root`      | `27de7a89c9b1824ec9383c772e8ae1ce385116c6` | `2327ef2eb149d9645fdbe274de1444560e59d3f0` | `2327ef2eb149d9645fdbe274de1444560e59d3f0`                                             |           6 | removed |
| `1787880853-3984726` | `feat/ux-copy-density-sweep`            | `e1c6eb6276b027d26c464767cd17cc7014a9eb11` | `6199686a08e59cf18906c3394ec474f7fd919725` | `6199686a08e59cf18906c3394ec474f7fd919725`                                             |           2 | removed |
| `1787909256-265667`  | `agent/wt-1787909256-265667`            | `d5577d3700720d47c468b89806a27198967dd32d` | `d9fa3bee3b3fce9cc0f1e764212c14ff37afb15c` | `d9fa3bee3b3fce9cc0f1e764212c14ff37afb15c`                                             |           2 | removed |
| `1787912180-385347`  | `feat/web-chat-shell`                   | `46c628d5473c2f9b325adda67fcc4d0fb63447d6` | `13992a54f91d7fa729646f98c6941b33eda30865` | `13992a54f91d7fa729646f98c6941b33eda30865`                                             |          10 | removed |
| `1787937123-780072`  | `agent/wt-1787937123-780072`            | `f18231d4b888f0837928729e6a4efd828c23e9bb` | `b55027fbf74fbc48cacb822c9654261e3092f6c6` | `b55027fbf74fbc48cacb822c9654261e3092f6c6`                                             |           2 | removed |
| `1787950183-1008359` | `agent/wt-1787950183-1008359`           | `13ef08aafe2cd0ec033a6265dad26fd018eb7bc7` | `546bb221f09f240c8ad0f67344195483f7fcf5ab` | `546bb221f09f240c8ad0f67344195483f7fcf5ab`                                             |           2 | removed |
| `1787950241-1010778` | `agent/wt-1787950241-1010778`           | `13ef08aafe2cd0ec033a6265dad26fd018eb7bc7` | `d4c9a368fd955c6931aa23917abf2b755583da65` | `d4c9a368fd955c6931aa23917abf2b755583da65`                                             |           2 | removed |
| `1787951717-1068232` | `agent/wt-1787951717-1068232`           | `41e0dae5b7aaaf5d18c982b0d100e6b73fd867f4` | `d92318ae3413f0d36a000450b13b442682d39963` | `d92318ae3413f0d36a000450b13b442682d39963`                                             |           4 | removed |
| `1787951734-1068973` | `perf/latency-budget-and-load-suite`    | `0e46f5890dce55781f3ce33a580ac9c78c8930a7` | `ab9b107a1ab3dbd0b1e2a00f4a786cdaf2520d13` | `ab9b107a1ab3dbd0b1e2a00f4a786cdaf2520d13`                                             |           2 | removed |
| `1787952957-1125790` | `feat/messages-timestamps-names`        | `a1e1513bdcf5c06cf695077ead8362bda0a574d5` | `c51ca57d11372edebef825dc09e5ed06f8af9fee` | `c51ca57d11372edebef825dc09e5ed06f8af9fee`                                             |          27 | removed |
| `1787953265-1140781` | `feat/harness-multinode-reset`          | `b75bfa361b5c7ad89ee8aaa5e98cf74fedf5ba6f` | `0ea69bd4ddbca811819386f89eff3b5ae48a030b` | `0ea69bd4ddbca811819386f89eff3b5ae48a030b`                                             |           8 | removed |
| `evomaster`          | `feat/h026-evomaster-fuzz`              | `46e72a81fae7ed0225583d214227932663ba1f08` | `be4d41823d844e5b861bf993928544da3a0ef9d9` | `be4d41823d844e5b861bf993928544da3a0ef9d9`                                             |          44 | removed |

## Clean worktrees removed

These worktrees had no local changes, so no checkpoint commit was needed. Their branches and original HEADs remain recoverable.

| Former path          | Branch                               | HEAD                                       | Removal                                                                                                                                             |
| -------------------- | ------------------------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `1787782220-2215137` | `agent/wt-1787782220-2215137`        | `672f05027b520fa2bd615dee8085c917f2b241a7` | removed (clean)                                                                                                                                     |
| `1787782231-2215563` | `agent/wt-1787782231-2215563`        | `672f05027b520fa2bd615dee8085c917f2b241a7` | removed (clean)                                                                                                                                     |
| `1787782241-2215920` | `agent/wt-1787782241-2215920`        | `672f05027b520fa2bd615dee8085c917f2b241a7` | removed (clean)                                                                                                                                     |
| `1787783248-2250416` | `agent/wt-1787783248-2250416`        | `672f05027b520fa2bd615dee8085c917f2b241a7` | removed (clean)                                                                                                                                     |
| `1787783274-2251897` | `agent/wt-1787783274-2251897`        | `672f05027b520fa2bd615dee8085c917f2b241a7` | removed (clean)                                                                                                                                     |
| `1787783433-2259544` | `agent/wt-1787783433-2259544`        | `672f05027b520fa2bd615dee8085c917f2b241a7` | removed (clean)                                                                                                                                     |
| `1787785068-2289531` | `agent/wt-1787785068-2289531`        | `26a2f5f9612df40da8db083e7c7645564e44f5fe` | removed (clean)                                                                                                                                     |
| `1787785088-2290157` | `agent/wt-1787785088-2290157`        | `26a2f5f9612df40da8db083e7c7645564e44f5fe` | removed (clean)                                                                                                                                     |
| `1787785110-2290847` | `agent/wt-1787785110-2290847`        | `26a2f5f9612df40da8db083e7c7645564e44f5fe` | removed (clean)                                                                                                                                     |
| `1787789384-2374654` | `agent/wt-1787789384-2374654`        | `46e72a81fae7ed0225583d214227932663ba1f08` | removed (clean)                                                                                                                                     |
| `1787789395-2375519` | `agent/wt-1787789395-2375519`        | `46e72a81fae7ed0225583d214227932663ba1f08` | removed with `--force` after an interrupted ordinary removal had already deleted its `.git` file; branch/HEAD and clean status were rechecked first |
| `1787790000-2377671` | `agent/wt-1787790000-2377671`        | `46e72a81fae7ed0225583d214227932663ba1f08` | removed (clean)                                                                                                                                     |
| `1787790002-2377909` | `agent/wt-1787790002-2377909`        | `46e72a81fae7ed0225583d214227932663ba1f08` | removed (clean)                                                                                                                                     |
| `1787791821-2417039` | `agent/wt-1787791821-2417039`        | `e1601357e0521eaa62a72ea82fdea27db74d7625` | removed (clean)                                                                                                                                     |
| `1787792563-2447173` | `agent/wt-1787792563-2447173`        | `87f542897d345fe69d90194a0a734c85389da841` | removed (clean)                                                                                                                                     |
| `1787793800-2463043` | `agent/wt-1787793800-2463043`        | `b428dec8ed75af1a9f567932a8810bcc545e6ab1` | removed (clean)                                                                                                                                     |
| `1787794656-2480868` | `agent/wt-1787794656-2480868`        | `3db2a08ba7419b0ea58127f6fd3a959d90dd17ae` | removed (clean)                                                                                                                                     |
| `1787795356-2500638` | `agent/wt-1787795356-2500638`        | `3e723ba7e40efbda5f828309db98df59068bd0a5` | removed (clean)                                                                                                                                     |
| `1787795579-2508888` | `agent/wt-1787795579-2508888`        | `d0163c62ef53bc340c2ca4cb1b411968c4d478aa` | removed (clean)                                                                                                                                     |
| `1787870057-3821755` | `agent/wt-1787870057-3821755`        | `2143dd4198331fb45cf1c777a079ed333c924d57` | removed (clean)                                                                                                                                     |
| `1787880863-3985278` | `perf/db-indexes-and-actor-search`   | `e29f2d93c6f275db8a25c4bbf0da214fe0a8eb38` | removed (clean)                                                                                                                                     |
| `1787910274-290899`  | `agent/wt-1787910274-290899`         | `6d2e5a7c35adb5180a7ba761ab43087b210d725d` | removed (clean)                                                                                                                                     |
| `1787910280-291070`  | `agent/wt-1787910280-291070`         | `6d2e5a7c35adb5180a7ba761ab43087b210d725d` | removed (clean)                                                                                                                                     |
| `1787912367-399791`  | `feat/rollout-discipline`            | `526cd491a359c534b718ee5c30d1f2cf75709812` | removed (clean)                                                                                                                                     |
| `1787913768-479218`  | `feat/client-parity-views-thread`    | `904b36892def9f77041afa3c8352e819be632ab9` | removed (clean)                                                                                                                                     |
| `1787937103-779305`  | `agent/wt-1787937103-779305`         | `f18231d4b888f0837928729e6a4efd828c23e9bb` | removed (clean)                                                                                                                                     |
| `1787937531-805556`  | `agent/wt-1787937531-805556`         | `8f39cb545a8b14c3762a08c2c4f0db08efd65a6c` | removed (clean)                                                                                                                                     |
| `1787953258-1140234` | `feat/customization-interaction-kit` | `7a4882780ac8a0c9f430f248318c406afb2c7c39` | removed (clean)                                                                                                                                     |
| `1787953275-1141446` | `docs/adr-repository-layer`          | `fee15de1582bbe4ba23867fae2080e4f10a1a00a` | removed (clean)                                                                                                                                     |
| `1787953958-1184312` | `fix/e2ee-persist-inbound`           | `b75bfa361b5c7ad89ee8aaa5e98cf74fedf5ba6f` | removed (clean)                                                                                                                                     |
| `1787953968-1184829` | `agent/wt-1787953968-1184829`        | `b75bfa361b5c7ad89ee8aaa5e98cf74fedf5ba6f` | removed (clean)                                                                                                                                     |
| `1787953974-1185415` | `docs/design-system-evaluation`      | `b75bfa361b5c7ad89ee8aaa5e98cf74fedf5ba6f` | removed (clean)                                                                                                                                     |
| `1787953982-1186168` | `docs/adr-open-customization`        | `b75bfa361b5c7ad89ee8aaa5e98cf74fedf5ba6f` | removed (clean)                                                                                                                                     |
| `adr-dm`             | `docs/dm-security-mode-adr`          | `46e72a81fae7ed0225583d214227932663ba1f08` | removed (clean)                                                                                                                                     |

## Processes and unregistered directories

Six stale Node services tied to removed or auxiliary worktrees were sent `SIGTERM` and exited: PIDs 402717, 1065903, 1065919, 1768952, 1781539, and 1175790. These comprised server/worker processes and two test HTTP servers.

The following three unregistered directories were deliberately preserved because they were not linked Git worktrees and were not inspected or modified as part of this cleanup:

- `/home/allie/develop/patches-agent-wt/1787721630-887470`
- `/home/allie/develop/patches-agent-wt/1787789305-2368716`
- `/home/allie/develop/patches-agent-wt/1787842519-3319404`

`/home/allie/develop/patches-agent-wt/.turbo-cache` was also left in place as a cache directory.

## Recovery

Recreate any worktree from its saved branch:

```sh
git worktree add /home/allie/develop/patches-agent-wt/<new-directory> <branch>
```

Inspect exactly what the checkpoint saved before deciding whether to fold it into another branch:

```sh
git diff --stat <old-head>..<new-head>
git diff <old-head>..<new-head>
git log --oneline <old-head>..<new-head>
```

Do not assume any checkpoint is green. Run the appropriate scoped checks and then `mise run verify` before merging or shipping recovered work.
