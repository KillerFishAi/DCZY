import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractUrlId,
  extractPostIdFromHtml,
  parseJsonpResponse,
  encodePoints,
  buildProxyUrl,
  parseRawCredentialInput,
  selectNextAccountForTask,
  applyCommentVariation,
  sanitizeHttpUrlInput,
  cleanRedundantLoginCookies,
  sanitizeAndAuditConfigJson,
  AccountItem,
} from './eastmoneyEngine';

test('extractUrlId extracts URL编号 from standard EastMoney Caifuhao URLs', () => {
  assert.equal(
    extractUrlId('https://caifuhao.eastmoney.com/news/20261110211425301094660'),
    '20261110211425301094660'
  );
  assert.equal(
    extractUrlId('https://caifuhao.eastmoney.com/news/20261110211425301094660.html?from=guba'),
    '20261110211425301094660'
  );
  assert.equal(extractUrlId('https://example.com/invalid'), null);
});

test('extractPostIdFromHtml distinguishes postid from URL编号, parses live unquoted postId, and falls back deterministically', () => {
  const sampleHtml = '<html><script>var post_id = "1794687421"; window.articleId = "20261110211425301094660";</script></html>';
  assert.equal(extractPostIdFromHtml(sampleHtml), '1794687421');

  const jsonHtml = '<div>{"postid":1798812345,"title":"A股复盘"}</div>';
  assert.equal(extractPostIdFromHtml(jsonHtml), '1798812345');

  // Exact live EastMoney Caifuhao HTML format from https://caifuhao.eastmoney.com/news/20261113152222640331720
  const liveCaifuhaoHtml = `
    <script>
      var articleInfo = {
        articleid:"20261113152222640331720", //文章id
        postId:"1796084880" ,
      };
    </script>
  `;
  assert.equal(extractPostIdFromHtml(liveCaifuhaoHtml), '1796084880');
  assert.equal(extractPostIdFromHtml('', '20261113152222640331720'), '1796084880');

  const fallback = extractPostIdFromHtml('<html></html>', '20269999999999999999999');
  assert.ok(fallback && fallback.length === 10);
});

test('parseJsonpResponse parses LikeArticle JSONP callback payload accurately', () => {
  const parsed = parseJsonpResponse('cb855({"rc":1,"msg":"点赞成功","data":{"likeCount":208}});');
  assert.deepEqual(parsed, { rc: 1, msg: '点赞成功', data: { likeCount: 208 } });
  assert.equal(parseJsonpResponse('invalid_jsonp_payload'), null);
});

test('encodePoints formats coordinates in all 6 probe styles accurately', () => {
  const pts = [
    { x: 48, y: 92 },
    { x: 135, y: 64 },
  ];
  assert.equal(encodePoints(pts, 'pipe'), '48,92|135,64');
  assert.equal(encodePoints(pts, 'semicolon'), '48,92;135,64');
  assert.equal(encodePoints(pts, 'comma'), '48,92,135,64');
  assert.equal(encodePoints(pts, 'flat'), '48 92 135 64');
  assert.equal(encodePoints(pts, 'json'), '[[48,92],[135,64]]');
  assert.equal(encodePoints(pts, 'jsonobj'), '[{"x":48,"y":92},{"x":135,"y":64}]');
});

test('buildProxyUrl supports unauthenticated and authenticated city proxies', () => {
  assert.equal(
    buildProxyUrl({ proxy_ip: '123.123.123.10', proxy_port: 1080 }),
    'http://123.123.123.10:1080'
  );
  assert.equal(
    buildProxyUrl({
      proxy_ip: '114.215.88.19',
      proxy_port: 8888,
      proxy_user: 'em_bot',
      proxy_pass: 'sec123',
    }),
    'http://em_bot:sec123@114.215.88.19:8888'
  );
});

test('parseRawCredentialInput extracts ct, ut, h, and deviceids from cURL snippet', () => {
  const curl = `curl 'https://gbapi.eastmoney.com//likeopt/JSONP/LikeArticle?version=100&product=EastMoney&plat=Web&h=90b7a8d5b8cc464806ef9032f5c308e2&deviceid=35dkmnjhbgtyhjko&callback=cb855&type=20&id=20261110211425301094660' \\
  -H 'Cookie: ct=token_ct_9988; ut=token_ut_7766; un=trader_wang'`;
  const res = parseRawCredentialInput(curl);
  assert.equal(res.hasCt, true);
  assert.equal(res.hasUt, true);
  assert.equal(res.h, '90b7a8d5b8cc464806ef9032f5c308e2');
  assert.equal(res.like_deviceid, '35dkmnjhbgtyhjko');
  assert.equal(res.username, 'trader_wang');
  assert.equal(res.canComment, true);
  assert.equal(res.canLike, true);
});

test('selectNextAccountForTask skips captcha cooldown and daily limit accounts automatically', () => {
  const pool: AccountItem[] = [
    {
      id: '1',
      username: 'acc_captcha',
      cookie: 'ct=111; ut=222',
      deviceid: 'dev1',
      like_deviceid: 'ldev1',
      h: '90b7a8d5b8cc464806ef9032f5c308e2',
      proxy_ip: '10.0.0.1',
      proxy_port: 1080,
      proxy_city: 'Beijing',
      enabled: true,
      status: 'cooldown_captcha',
      daily_comments_used: 1,
      total_clicks: 5,
      total_likes: 2,
      total_comments: 1,
      captcha_hits: 1,
    },
    {
      id: '2',
      username: 'acc_limit_reached',
      cookie: 'ct=333; ut=444',
      deviceid: 'dev2',
      like_deviceid: 'ldev2',
      h: '90b7a8d5b8cc464806ef9032f5c308e2',
      proxy_ip: '10.0.0.2',
      proxy_port: 1080,
      proxy_city: 'Shanghai',
      enabled: true,
      status: 'ready',
      daily_comments_used: 5,
      total_clicks: 8,
      total_likes: 4,
      total_comments: 5,
      captcha_hits: 0,
    },
    {
      id: '3',
      username: 'acc_healthy',
      cookie: 'ct=555; ut=666',
      deviceid: 'dev3',
      like_deviceid: 'ldev3',
      h: '90b7a8d5b8cc464806ef9032f5c308e2',
      proxy_ip: '10.0.0.3',
      proxy_port: 1080,
      proxy_city: 'Shenzhen',
      enabled: true,
      status: 'ready',
      daily_comments_used: 2,
      total_clicks: 4,
      total_likes: 2,
      total_comments: 2,
      captcha_hits: 0,
    },
  ];

  const selection = selectNextAccountForTask(pool, 0, 5, true);
  assert.ok(selection.account);
  assert.equal(selection.account.username, 'acc_healthy');
  assert.equal(selection.skippedReasons.length, 2);
});

test('applyCommentVariation adds natural anti-spam suffix when enabled', () => {
  const base = '非常有价值的分析！';
  assert.equal(applyCommentVariation(base, 0, true), '非常有价值的分析！');
  assert.equal(applyCommentVariation(base, 1, true), '非常有价值的分析，赞同！');
  assert.equal(applyCommentVariation(base, 1, false), '非常有价值的分析！');
});

import {
  generateSampleAccountsCsv,
  generate97AccountsSampleText,
  parseAccountSpreadsheet,
  harvestAccountCredentialsStep,
  refreshAccountsWithDynamicProxies,
  auditAccountCapabilities,
} from './eastmoneyEngine';
import {
  buildUpgradePatchZip,
  buildZipArchive,
  generateRepairedPythonFiles,
} from './pythonExporter';
import { INITIAL_ACCOUNTS, INITIAL_ENGINE_SETTINGS, INITIAL_TASK_CONFIG } from './seedData';

test('parseAccountSpreadsheet parses CSV, tab-separated, and 97 slash-separated (136********/dmjzUOzAp8) rows and harvestAccountCredentialsStep completes ct/ut/h', () => {
  const sampleCsv = generateSampleAccountsCsv();
  const imported = parseAccountSpreadsheet(sampleCsv);
  assert.equal(imported.length, 5);
  assert.equal(imported[0].username, '13800138001');
  assert.equal(imported[0].password, 'EmPass@2026a');
  assert.equal(imported[0].status, 'pending_harvest');

  const slash97 = parseAccountSpreadsheet(generate97AccountsSampleText());
  assert.equal(slash97.length, 97);
  const { updatedAccounts } = refreshAccountsWithDynamicProxies(slash97);
  assert.equal(updatedAccounts.length, 97);
  assert.ok(updatedAccounts[0].proxy_city.includes('天启3分钟高匿'));

  // Verify exact Tianqi IP JSON format from PDF Page 3 (code: 1000, string port, prov + city)
  const tianqiSample = JSON.stringify({
    code: 1000,
    data: [{ ip: '121.227.60.236', port: '20252', prov: '辽宁', city: '鞍山' }],
  });
  const { extractedNodes } = refreshAccountsWithDynamicProxies(slash97.slice(0, 1), tianqiSample);
  assert.equal(extractedNodes.length, 1);
  assert.equal(extractedNodes[0].ip, '121.227.60.236');
  assert.equal(extractedNodes[0].port, 20252);
  assert.equal(extractedNodes[0].city, '辽宁鞍山');

  // Unharvested account should be skipped by rotation selector
  const skipCheck = selectNextAccountForTask([imported[0]], 0, 5, true);
  assert.equal(skipCheck.account, null);
  assert.ok(skipCheck.skippedReasons[0].reason.includes('待自动登录提取'));

  // Harvest credentials automatically
  const harvested = harvestAccountCredentialsStep(imported[0]);
  assert.equal(harvested.status, 'ready');
  assert.equal(harvested.harvest_status, 'harvested');
  const audit = auditAccountCapabilities(harvested, 5);
  assert.equal(audit.hasCt, true);
  assert.equal(audit.hasUt, true);
  assert.equal(audit.canLike, true);
  assert.equal(audit.canComment, true);
});

test('buildZipArchive packages all 17 repaired project, auto-login agent, AI handoff doc, and GUI files into a valid PKZIP archive compatible with Python 3.14+ and Tianqi 180s IP', () => {
  const files = generateRepairedPythonFiles(INITIAL_ACCOUNTS, INITIAL_TASK_CONFIG, INITIAL_ENGINE_SETTINGS);
  assert.equal(Object.keys(files).length, 17);
  assert.ok(files['AI技术对接研发文档.md']);
  assert.ok(files['00_双击我_表格账号全自动登录提取凭证.bat']);
  assert.ok(files['auto_login_agent.py']);
  assert.ok(files['账号密码批量导入表_accounts.csv']);
  assert.ok(files['0_双击我_启动可视化图形界面(推荐).bat']);
  assert.ok(files['gui_app.py']);
  assert.ok(files['1_双击我_一键启动运营任务.bat']);
  assert.ok(files['config.json']);
  assert.ok(files['main_engine.py']);

  // Verify Python 3.14.4+ compatibility: greenlet>=3.3.1 cp314 wheel pin + no legacy ddddocr/opencv wheel blockers
  const reqs = files['requirements.txt'];
  assert.ok(reqs.includes('greenlet>=3.3.1'));
  assert.ok(reqs.includes('aiohttp>=3.10.0'));
  assert.ok(reqs.includes('playwright>=1.48.0'));
  assert.equal(reqs.includes('ddddocr'), false);
  assert.equal(reqs.includes('opencv-python'), false);

  // Verify URL sanitizer strips surrounding Chinese labels/whitespace
  assert.equal(
    sanitizeHttpUrlInput('  提取链接：http://api.tianqiip.com/getip?secret=abc&num=3  \n'),
    'http://api.tianqiip.com/getip?secret=abc&num=3'
  );

  // Verify Tianqi 180s (3-minute) proactive 110s TTL protection, dead-IP auto-eviction, AliDNS DoH fallback, and Playwright pre-flight guard
  assert.ok(files['proxy_pool.py'].includes('TTL_RENEW_SECONDS = 110'));
  assert.ok(files['proxy_pool.py'].includes('def invalidate_proxy'));
  assert.ok(files['proxy_pool.py'].includes('223.5.5.5/resolve'));
  assert.ok(files['auto_login_agent.py'].includes('DEFAULT_BATCH_SIZE = 2'));
  assert.ok(files['auto_login_agent.py'].includes('HUMAN_WAIT_SECONDS = 90'));
  assert.ok(files['auto_login_agent.py'].includes('check_proxy_alive'));
  assert.ok(files['auto_login_agent.py'].includes('atomic_save_config'));
  assert.ok(files['auto_login_agent.py'].includes('route_accelerator'));
  assert.ok(files['auto_login_agent.py'].includes('--only-new'));
  assert.ok(files['auto_login_agent.py'].includes('--only-missing-h'));
  assert.ok(files['auto_login_agent.py'].includes('acc_tab.hover'));
  assert.ok(files['auto_login_agent.py'].includes('--window-position='));
  assert.ok(files['auto_login_agent.py'].includes('223.5.5.5/resolve'));
  assert.ok(files['gui_app.py'].includes('handle_import_accounts'));
  assert.ok(files['gui_app.py'].includes("runAuxScript('harvest_new')"));
  assert.ok(files['gui_app.py'].includes("runAuxScript('harvest_h')"));

  // Verify live EastMoney post 20261113152222640331720 -> postid 1796084880, real Referer/Origin headers, & hardened live DOM selectors
  assert.ok(files['config.json'].includes('20261113152222640331720'));
  assert.ok(files['config.json'].includes('1796084880'));
  assert.ok(files['eastmoney_api.py'].includes('post_?id'));
  assert.ok(files['eastmoney_api.py'].includes('"X-Requested-With": "XMLHttpRequest"'));
  assert.ok(files['main_engine.py'].includes('article_url=article_url'));
  assert.ok(files['auto_login_agent.py'].includes('#txt_account'));
  assert.ok(files['auto_login_agent.py'].includes('img.selectbox.unselected'));
  assert.ok(files['auto_login_agent.py'].includes('".zan"'));

  // Verify .bat scripts use Windows CRLF (\r\n), lock working directory, and use -m pip / -m playwright
  assert.ok(files['00_双击我_表格账号全自动登录提取凭证.bat'].includes('\r\n'));
  assert.ok(files['00_双击我_表格账号全自动登录提取凭证.bat'].includes('cd /d "%~dp0"'));
  assert.ok(files['00_双击我_表格账号全自动登录提取凭证.bat'].includes('-m playwright install chromium'));
  assert.ok(files['0_双击我_启动可视化图形界面(推荐).bat'].includes('-m pip install'));

  const zipBytes = buildZipArchive(files, 'eastmoney_bot_v6.0');
  // Verify PK\x03\x04 local file header signature
  assert.equal(zipBytes[0], 0x50);
  assert.equal(zipBytes[1], 0x4b);
  assert.equal(zipBytes[2], 0x03);
  assert.equal(zipBytes[3], 0x04);
  assert.ok(zipBytes.byteLength > 5000);

  // Verify shared_h cross-account fallback is removed and local security reminder is included
  assert.equal(files['main_engine.py'].includes('_shared_h'), false);
  assert.ok(files['main_engine.py'].includes('clean_cookie_string'));
  assert.ok(files['main_engine.py'].includes('[本地安全提醒]'));
  assert.equal(files['auto_login_agent.py'].includes('shared_h ='), false);
  assert.ok(files['auto_login_agent.py'].includes('format_clean_cookies'));
  assert.ok(files['auto_login_agent.py'].includes('[本地安全提醒]'));
  assert.ok(files['gui_app.py'].includes('HTML_PAGE = r"""<!DOCTYPE html>'));
  assert.ok(files['gui_app.py'].includes("join('\\n')"));
  assert.ok(files['gui_app.py'].includes('split(/\\r?\\n/)'));
});

test('cleanRedundantLoginCookies and sanitizeAndAuditConfigJson strip temporary login fields and clear duplicate shared_h values', () => {
  const rawCk =
    'RequestData=%7b%22agentPageUrl%22%3a123; p_origin=https%3A%2F%2Fpassport2.eastmoney.com; st_inirUrl=https%3A%2F%2Fpassport2.eastmoney.com; __RequestVerificationToken=tok123; sid=; ct=unique_ct_01; ut=unique_ut_01; uidal=uid_abc';
  const cleanedRes = cleanRedundantLoginCookies(rawCk);
  assert.equal(cleanedRes.cleaned, 'ct=unique_ct_01; ut=unique_ut_01; uidal=uid_abc');
  assert.equal(cleanedRes.removedKeys.length, 5);

  const mockConfig = JSON.stringify({
    accounts: [
      {
        username: '13800000001',
        cookie: rawCk,
        deviceid: '12dkmnjhbgtyhjko',
        like_deviceid: '35dkmnjhbgtyhjko',
        h: 'cf91281381f2a8d47b1fcbf647285caf',
        proxy_ip: '121.230.9.17',
        proxy_port: 40038,
        proxy_city: '江苏无锡',
        enabled: true,
      },
      {
        username: '13800000002',
        cookie: 'RequestData=abc; ct=unique_ct_02; ut=unique_ut_02',
        deviceid: '12dkmnjhbgtyhjko',
        like_deviceid: '35dkmnjhbgtyhjko',
        h: 'cf91281381f2a8d47b1fcbf647285caf',
        proxy_ip: '118.113.246.118',
        proxy_port: 40026,
        proxy_city: '四川成都',
        enabled: true,
      },
      {
        username: '13800000003',
        cookie: 'ct=unique_ct_03; ut=unique_ut_03',
        deviceid: '12dkmnjhbgtyhjko',
        like_deviceid: '35dkmnjhbgtyhjko',
        h: '9d6063959bb67a39835d0534828262e8',
        proxy_ip: '42.178.198.47',
        proxy_port: 40023,
        proxy_city: '河北保定',
        enabled: true,
      },
    ],
    task: {
      url: 'https://caifuhao.eastmoney.com/news/20261113152222640331720',
      resolved_url_id: '20261113152222640331720',
      resolved_postid: '1796084880',
    },
    settings: {
      max_concurrency: 5,
    },
  });

  const audit = sanitizeAndAuditConfigJson(mockConfig);
  assert.equal(audit.summary.totalAccounts, 3);
  assert.equal(audit.summary.validCtUtCount, 3);
  assert.equal(audit.summary.cleanedCookieAccounts, 2);
  assert.equal(audit.summary.retainedUniqueHCount, 2);
  assert.equal(audit.summary.clearedDuplicateHCount, 1);
  assert.equal(audit.accounts[0].h, 'cf91281381f2a8d47b1fcbf647285caf');
  assert.equal(audit.accounts[1].h, '');
  assert.equal(audit.accounts[2].h, '9d6063959bb67a39835d0534828262e8');
  assert.equal(audit.accounts[0].cookie.includes('RequestData'), false);
});

import vm from 'node:vm';
import {
  thresholdToSeconds,
  generateRandomCommentIntervalSec,
  formatDurationChinese,
} from './eastmoneyEngine';

test('generateRandomCommentIntervalSec generates non-fixed intervals strictly <= user threshold in both seconds and minutes', () => {
  assert.equal(thresholdToSeconds(45, 'seconds'), 45);
  assert.equal(thresholdToSeconds(3, 'minutes'), 180);
  assert.equal(formatDurationChinese(45), '45秒');
  assert.equal(formatDurationChinese(180), '3分钟');
  assert.equal(formatDurationChinese(135), '2分15秒');

  // Boundary RNG checks for 50 seconds threshold
  const minVal = generateRandomCommentIntervalSec(50, 'seconds', () => 0);
  const midVal = generateRandomCommentIntervalSec(50, 'seconds', () => 0.5);
  const maxVal = generateRandomCommentIntervalSec(50, 'seconds', () => 1);
  assert.ok(minVal >= 1 && minVal <= 50);
  assert.ok(midVal > minVal && midVal < maxVal);
  assert.equal(maxVal, 50);

  // 200 randomized draws in minutes mode (threshold = 3 minutes = 180s) must never exceed 180s and must vary
  const samples = new Set<number>();
  for (let i = 0; i < 200; i++) {
    const drawn = generateRandomCommentIntervalSec(3, 'minutes');
    assert.ok(drawn >= 1 && drawn <= 180, `Expected drawn ${drawn}s <= 180s`);
    samples.add(drawn);
  }
  assert.ok(samples.size > 15, 'Expected non-fixed randomized interval values');
});

test('selectNextAccountForTask enforces standalone mode requirements for click, like, and comment', () => {
  const noHAccount: AccountItem = {
    id: 'a1',
    username: 'acc_no_h',
    cookie: 'ct=tok1; ut=tok2',
    deviceid: 'dev1',
    like_deviceid: 'ldev1',
    h: '',
    proxy_ip: '10.0.0.1',
    proxy_port: 1080,
    proxy_city: '重庆',
    enabled: true,
    status: 'ready',
    daily_comments_used: 0,
    total_clicks: 0,
    total_likes: 0,
    total_comments: 0,
    captcha_hits: 0,
  };
  const withHAccount: AccountItem = {
    ...noHAccount,
    id: 'a2',
    username: 'acc_with_h',
    h: 'cf91281381f2a8d47b1fcbf647285caf',
  };

  // In standalone 'click' mode, acc_no_h is immediately eligible
  const clickPick = selectNextAccountForTask([noHAccount, withHAccount], 0, 5, false, 'click');
  assert.equal(clickPick.account?.username, 'acc_no_h');

  // In standalone 'like' mode, acc_no_h is skipped because h is empty, selecting acc_with_h
  const likePick = selectNextAccountForTask([noHAccount, withHAccount], 0, 5, false, 'like');
  assert.equal(likePick.account?.username, 'acc_with_h');
  assert.equal(likePick.skippedReasons.length, 1);

  // In standalone 'comment' mode, acc_no_h has valid ct/ut so it is eligible for commenting
  const commentPick = selectNextAccountForTask([noHAccount, withHAccount], 0, 5, true, 'comment');
  assert.equal(commentPick.account?.username, 'acc_no_h');
});

test('exported gui_app.py embedded JavaScript parses cleanly and main_engine.py supports standalone modes and 4-in-1 client actions', () => {
  const files = generateRepairedPythonFiles(INITIAL_ACCOUNTS, INITIAL_TASK_CONFIG, INITIAL_ENGINE_SETTINGS);
  assert.ok(files['main_engine.py'].includes('compute_random_comment_delay_sec'));
  assert.ok(files['main_engine.py'].includes('_run_standalone_clicks'));
  assert.ok(files['main_engine.py'].includes('_run_standalone_likes'));
  assert.ok(files['main_engine.py'].includes('_run_standalone_comments'));
  assert.ok(files['gui_app.py'].includes("runSoloTask('click')"));
  assert.ok(files['gui_app.py'].includes("runSoloTask('like')"));
  assert.ok(files['gui_app.py'].includes("runSoloTask('comment')"));
  assert.ok(files['gui_app.py'].includes("runAuxScript('harvest')"));
  assert.ok(files['gui_app.py'].includes("runAuxScript('probe')"));
  assert.ok(files['gui_app.py'].includes('handle_test_proxy'));
  assert.ok(files['gui_app.py'].includes('handle_merge_config'));
  assert.ok(files['gui_app.py'].includes("runAuxScript('install_env')"));
  assert.ok(files['gui_app.py'].includes('open_client_window'));
  assert.ok(files['gui_app.py'].includes('os.path.expandvars'));
  assert.equal(files['gui_app.py'].includes('os.expandvars('), false);
  assert.ok(files['gui_app.py'].includes('commentIntervalMaxInput'));
  assert.ok(files['gui_app.py'].includes('commentIntervalUnitSelect'));
  assert.ok(files['auto_login_agent.py'].includes('ensure_playwright_ready'));
  assert.ok(files['auto_login_agent.py'].includes('--install-only'));
  assert.ok(files['auto_login_agent.py'].includes('has_img_captcha'));
  assert.ok(files['auto_login_agent.py'].includes('not real_auth_ok'));
  assert.ok(files['proxy_pool.py'].includes('async def refresh_from_api'));
  assert.ok(files['proxy_pool.py'].includes('_SHARED_NODES'));
  assert.ok(files['gui_app.py'].includes('ProxyPool(config_path=CONFIG_FILE, api_url=api_url, auto_load=False)'));
  assert.ok(files['0_双击我_启动可视化图形界面(推荐).bat'].includes('python-3.12.8-amd64.exe'));
  assert.ok(files['00_双击我_表格账号全自动登录提取凭证.bat'].includes('python-3.12.8-amd64.exe'));
  assert.ok(files['1_双击我_一键启动运营任务.bat'].includes('--mode %RUN_MODE%'));

  // Extract <script>...</script> from gui_app.py HTML_PAGE (raw Python string) and compile with Node vm.Script
  const scriptMatch = files['gui_app.py'].match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(scriptMatch, 'Expected <script> block in gui_app.py');
  assert.doesNotThrow(() => {
    new vm.Script(scriptMatch[1]);
  });
});

test('anti-407 direct harvest mode, CGNAT proxy auth, immediate cookie save, and buildUpgradePatchZip exclude config.json', () => {
  const customSettings = {
    ...INITIAL_ENGINE_SETTINGS,
    proxy_user: 'tq_user_01',
    proxy_pass: 'tq_pass_99',
  };
  const files = generateRepairedPythonFiles(INITIAL_ACCOUNTS, INITIAL_TASK_CONFIG, customSettings);

  // config.json includes proxy_user / proxy_pass
  const parsedCfg = JSON.parse(files['config.json']);
  assert.equal(parsedCfg.settings.proxy_user, 'tq_user_01');
  assert.equal(parsedCfg.settings.proxy_pass, 'tq_pass_99');

  // proxy_pool.py has import os, import base64, multi-socket CGNAT scanner, and 407 diagnostics
  assert.ok(files['proxy_pool.py'].includes('import os'));
  assert.ok(files['proxy_pool.py'].includes('import base64'));
  assert.ok(files['proxy_pool.py'].includes('def scan_all_public_ips'));
  assert.ok(files['proxy_pool.py'].includes('auth_407_nodes'));

  // auto_login_agent.py has --direct, immediate_save_cookie, CGNAT scanner, and clean X-close skip
  assert.ok(files['auto_login_agent.py'].includes('"--direct"'));
  assert.ok(files['auto_login_agent.py'].includes('async def immediate_save_cookie'));
  assert.ok(files['auto_login_agent.py'].includes('scan_all_outbound_ips'));
  assert.ok(files['auto_login_agent.py'].includes('user_closed_skip'));
  assert.ok(files['auto_login_agent.py'].includes('本机直连保底(自动绕过407)'));

  // gui_app.py has single-window direct harvest action, pending password editor, and proxy auth inputs
  assert.ok(files['gui_app.py'].includes("runAuxScript('harvest_direct')"));
  assert.ok(files['gui_app.py'].includes('handle_pending_accounts'));
  assert.ok(files['gui_app.py'].includes('loadPendingAccounts'));
  assert.ok(files['gui_app.py'].includes('proxyUserInput'));
  assert.ok(files['gui_app.py'].includes('proxyPassInput'));

  // 00 bat defaults to --direct --batch-size 1
  assert.ok(
    files['00_双击我_表格账号全自动登录提取凭证.bat'].includes('auto_login_agent.py --direct --batch-size 1')
  );

  // buildUpgradePatchZip strictly excludes config.json and 账号密码批量导入表_accounts.csv
  const patchBytes = buildUpgradePatchZip(files, '');
  assert.equal(patchBytes[0], 0x50);
  assert.equal(patchBytes[1], 0x4b);

  const view = new DataView(patchBytes.buffer, patchBytes.byteOffset, patchBytes.byteLength);
  const decoder = new TextDecoder();
  const entryNames: string[] = [];
  let offset = 0;
  while (offset + 30 <= patchBytes.byteLength && view.getUint32(offset, true) === 0x04034b50) {
    const dataLen = view.getUint32(offset + 18, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const name = decoder.decode(patchBytes.subarray(offset + 30, offset + 30 + nameLen));
    entryNames.push(name);
    offset += 30 + nameLen + extraLen + dataLen;
  }

  assert.equal(entryNames.length, 15);
  assert.equal(entryNames.includes('config.json'), false);
  assert.equal(entryNames.includes('账号密码批量导入表_accounts.csv'), false);
  assert.equal(entryNames.includes('AI技术对接研发文档.md'), true);
  assert.equal(entryNames.includes('auto_login_agent.py'), true);
  assert.equal(entryNames.includes('gui_app.py'), true);
  assert.equal(entryNames.includes('proxy_pool.py'), true);
  assert.equal(entryNames.includes('main_engine.py'), true);

  const handoffDoc = files['AI技术对接研发文档.md'];
  assert.ok(handoffDoc.includes('_CLASS_LOCK'));
  assert.ok(handoffDoc.includes('GetArticleReadCount'));
  assert.ok(handoffDoc.includes('max_uses_per_ip'));
  assert.ok(handoffDoc.includes('严禁覆盖'));
  assert.ok(handoffDoc.includes('P0'));
});

import {
  normalizeTaskModes,
  calculateMultiTaskProgress,
  pickNextPendingModeInJob,
  createMultiTaskJob,
  stepMultiTaskJob,
} from './eastmoneyEngine';

test('multi-task engine state transitions, progress calculation, and public read verification work accurately', () => {
  assert.deepEqual(normalizeTaskModes(['comment', 'click', 'comment']), ['click', 'comment']);
  assert.deepEqual(normalizeTaskModes([]), ['click']);

  const job = createMultiTaskJob(
    {
      ...INITIAL_TASK_CONFIG,
      target_clicks: 3,
      target_likes: 2,
      target_comments: 1,
    },
    ['click', 'like', 'comment'],
    1,
    1400
  );

  assert.equal(job.status, 'running');
  assert.equal(job.observed_read_start, 1400);
  assert.equal(job.observed_read_current, 1400);
  assert.deepEqual(calculateMultiTaskProgress(job), {
    doneUnits: 0,
    totalUnits: 6,
    percent: 0,
    isComplete: false,
  });

  // Step through all 6 units across modes and verify automatic completion at 100%
  let cur = job;
  for (let i = 0; i < 6; i++) {
    const mode = pickNextPendingModeInJob(cur, i);
    assert.ok(mode, `Expected pending mode at step ${i}`);
    cur = stepMultiTaskJob(cur, mode, `step-${i}`, 1);
  }
  assert.equal(cur.completed_clicks, 3);
  assert.equal(cur.completed_likes, 2);
  assert.equal(cur.completed_comments, 1);
  assert.equal(cur.observed_read_current, 1403);
  assert.equal(cur.status, 'completed');
  assert.equal(calculateMultiTaskProgress(cur).percent, 100);
  assert.equal(pickNextPendingModeInJob(cur, 0), null);
});

test('exported Python client includes multi-task queue APIs, live progress table, per-IP usage cap, and GetArticleReadCount snapshot', () => {
  const files = generateRepairedPythonFiles(INITIAL_ACCOUNTS, INITIAL_TASK_CONFIG, INITIAL_ENGINE_SETTINGS);

  // eastmoney_api.py: GetArticleReadCount + multi-round anonymous_visit + HTML body validation
  assert.ok(files['eastmoney_api.py'].includes('def get_article_read_count'));
  assert.ok(files['eastmoney_api.py'].includes('GetArticleReadCount'));
  assert.ok(files['eastmoney_api.py'].includes('anonymous_visit: bool = False'));

  // proxy_pool.py: per-IP hit tracking max_uses_per_ip
  assert.ok(files['proxy_pool.py'].includes('max_uses_per_ip'));
  assert.ok(files['proxy_pool.py'].includes('_node_hits'));

  // main_engine.py: multi-mode concurrent execution + Playwright JS reading engine + proxy protection + public read count snapshot
  assert.ok(files['main_engine.py'].includes('task_override'));
  assert.ok(files['main_engine.py'].includes('_wait_if_paused'));
  assert.ok(files['main_engine.py'].includes('_refresh_public_read_snapshot'));
  assert.ok(files['main_engine.py'].includes('self.proxy_pool.get_proxy_for_account, account, 1'));
  assert.ok(files['main_engine.py'].includes('async def _click_worker_browser'));
  assert.ok(files['main_engine.py'].includes('async_playwright'));
  assert.ok(files['main_engine.py'].includes('web_click'));
  assert.ok(files['main_engine.py'].includes('bdwblog'));
  assert.ok(files['main_engine.py'].includes("navigator, 'webdriver'"));
  assert.ok(files['main_engine.py'].includes('random.shuffle(enabled_accounts)'));
  assert.ok(files['main_engine.py'].includes('random.shuffle(like_accounts)'));
  assert.ok(files['main_engine.py'].includes('random.shuffle(comment_accounts)'));
  assert.ok(files['main_engine.py'].includes('format_proxy_host'));
  assert.ok(files['main_engine.py'].includes('"--modes"'));

  // proxy_pool.py: class-level reentrant lock, QPS pacing, disk hot-reload, Playwright proxy parser, status note flushing, and strict quota clearing
  assert.ok(files['proxy_pool.py'].includes('threading.RLock'));
  assert.ok(files['proxy_pool.py'].includes('_CLASS_LOCK'));
  assert.ok(files['proxy_pool.py'].includes('_LAST_API_CALL_TS'));
  assert.ok(files['proxy_pool.py'].includes('def _reload_proxy_settings_from_disk'));
  assert.ok(files['proxy_pool.py'].includes('def pop_status_notes'));
  assert.ok(files['proxy_pool.py'].includes('def to_playwright_proxy'));
  assert.ok(files['proxy_pool.py'].includes('def has_proxy_api'));

  // config.json: includes read_engine and require_proxy_for_read defaults
  const cfg = JSON.parse(files['config.json']);
  assert.equal(cfg.settings.read_engine, 'browser');
  assert.equal(cfg.settings.require_proxy_for_read, true);

  // gui_app.py: MULTI_JOBS queue, readEngineSelect, requireProxyReadChk, and properly escaped /news/(\d+) regex
  assert.ok(files['gui_app.py'].includes('MULTI_JOBS'));
  assert.ok(files['gui_app.py'].includes('handle_jobs_create'));
  assert.ok(files['gui_app.py'].includes('handle_jobs_action'));
  assert.ok(files['gui_app.py'].includes('runMultiTaskJob'));
  assert.ok(files['gui_app.py'].includes('renderJobsTable'));
  assert.ok(files['gui_app.py'].includes('readEngineSelect'));
  assert.ok(files['gui_app.py'].includes('requireProxyReadChk'));
  assert.ok(files['gui_app.py'].includes('r"/news/(\\d+)"'));
});



