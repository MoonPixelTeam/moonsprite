type PrivacySection = { id: string; title: string; paragraphs: string[] }
type PrivacyText = { title: string; version: string; updated: string; notice: string; sections: PrivacySection[] }

export const privacyCopy: Record<'zh' | 'en', PrivacyText> = {
  zh: {
    title: '隐私政策',
    version: '1.0 — 待发布草案',
    updated: '更新日期：2026年9月22日',
    notice: '本政策说明当前网站原型的数据处理方式。当前账号、交易和提现为本地演示，未接入真实支付或账号服务。请使用测试资料，不要填写真实金融账户或复用重要密码。上线联网服务前，需核实实际处理者及依法应披露的信息、服务商、保存期限和数据存放地点，并更新本政策；本草案不表示这些上线事项已经完成。',
    sections: [
      { id: 'privacy-scope', title: '适用范围与基本原则', paragraphs: [
        '本政策适用于 MoonSprite 网站的访问、账号、素材市场、购买记录、创作者工作室及客服功能。“我们”指本网站的维护与服务提供方，此称谓不表示已设立公司或其他注册主体。隐私事务联系邮箱为 2310502033@qq.com。',
        '本政策不自动涵盖 MoonSprite 桌面软件、GitHub、社区网站或其他第三方独立提供的服务。进入这些服务后，其自身的隐私规则适用；素材许可与交易权利另见许可协议。',
        '我们以目的明确、最小必要和透明告知为原则。阅读或继续使用网站不等于同意所有数据处理，也不构成对敏感个人信息处理或跨境提供的概括授权。需要同意、单独同意或其他法定手续时，应在相应处理发生前依法完成。',
      ] },
      { id: 'privacy-data', title: '信息类别、用途与必要性', paragraphs: [
        '访问与偏好：浏览器语言用于首次选择显示语言；您选择的语言、主题和购物车中的商品标识及数量用于保留界面偏好和购物进度。浏览公开页面不需要注册账号。',
        '账号与登录：注册表单要求昵称、电子邮箱和密码，用于建立本地演示账号；登录使用邮箱和密码进行本地校验。当前保存账号标识、昵称、邮箱、创建时间、验证状态及密码摘要，不将密码作为明文账号字段保存。当前摘要方案不等同于生产级密码保护。拒绝填写注册必填项将无法创建账号，但不影响浏览公开内容。',
        '订单与售后：演示订单包含账号关联、订单标识、商品、金额、时间和状态等记录，用于展示购买、订单和下载流程；客服工单包含主题、正文、关联订单、时间、处理状态和回复，用于演示问题处理。当前下单不会发起真实扣款，工单也不会自动发送到远程客服。',
        '创作与审核：作品资料、作者信息、定价、封面以及您选择的素材文件用于预览、发布演示和下载；文件记录包含文件名、类型、大小、内容和更新时间。举报原因、补充说明、举报者关联及审核结果用于演示内容管理。请勿在作品、文件或举报内容中夹带无关个人信息或未经授权的他人资料。',
        '收款与提现：您每次申请提现时填写的支付宝账号、实名认证姓名，以及提现金额、时间、状态和收款目的地用于演示结算。不再提供独立收款方式设置，收款信息随该笔提现申请保存。金融账户信息可能属于敏感个人信息；当前不验证真实账户、不接入支付机构、不实际转账，请仅使用测试值。完整支付宝账号和姓名保存在本地提现记录中，该存储未加密。',
        '邮件联系：您主动发邮件时，发件地址、邮件正文、附件及必要的往来信息将用于回复、核实问题和处理请求。除解决问题确有必要外，请勿发送密码、支付验证码、完整金融账户、身份证件或其他敏感资料。',
      ] },
      { id: 'privacy-storage', title: '本地存储、Cookie 与网络请求', paragraphs: [
        '当前网站未配置账号 API，账号和交易流程使用本地适配器。localStorage 保存账号与订单（moonsprite-accounts）、登录状态（moonsprite-session）、工作室作品与提现（moonsprite-studio）、工作室解锁状态（moonsprite-studio-session）。这些记录不会因关闭标签页而自动消失。',
        'localStorage 还保存购物车（moonsprite-market-cart）、语言（moonsprite-language）、主题（moonsprite-site-theme）、按账号或访客区分的客服工单（moonsprite-support:*），以及举报与审核信息（moonsprite-moderation）。',
        '您在素材上传功能中选择并保存的文件存放于当前浏览器的 IndexedDB 数据库 moonsprite-files 的 packs 存储中。当前“上传”“发布”操作属于本地原型，不表示文件已经上传至远程服务器或向其他设备的用户公开。浏览器存储不是可靠备份，浏览器清理、存储回收或设备损坏可能导致丢失。',
        '当前应用代码未接入广告追踪、第三方访问统计 SDK，也未通过 Cookie 实现当前本地登录；本地存储不等于 Cookie。当前页面没有申请定位、通讯录、摄像头或麦克风权限。上述说明不代表托管基础设施或外部网站完全不使用日志或 Cookie。',
        '加载网站、静态资源以及访问外部链接或下载地址时，请求会到达相应服务器，可能包含 IP 地址、请求时间、浏览器请求头和来源信息，具体取决于浏览器及服务器设置。当前未核实托管方的日志字段、保存期限或存放地区，因此不承诺访问网站完全不产生网络数据。',
      ] },
      { id: 'privacy-basis', title: '处理依据与选择', paragraphs: [
        '根据适用法律和具体处理活动，必要的信息处理可能基于为您提供所请求服务、履行适用法定义务或取得有效同意等依据。我们不以本政策代替法律要求的具体告知，也不以笼统的“业务需要”扩大处理范围。当前本地演示不表示真实交易合同、支付授权或营销订阅已经成立。',
        '您可不注册、不提交工单、不填写结算信息或不选择素材文件；相应演示功能可能无法完成，但仍可浏览公开页面。对于依法以同意为依据的处理，您可以撤回同意；撤回不影响此前基于有效同意已进行处理的效力。',
        '如未来增加非必要统计、推广、敏感信息处理或新的处理目的，应在启用前提供明确说明，并在法律要求时征求相应同意。不会仅因您未同意非必要处理而拒绝与其无关的基本服务。',
      ] },
      { id: 'privacy-sharing', title: '对外提供、公开与第三方服务', paragraphs: [
        '当前应用实现不包含出售个人信息、广告画像或将本地账号和订单自动同步给第三方的功能。当前没有接入真实支付或结算服务商；本地管理界面能够查看演示记录，不应被理解为已经部署远程客服或经过生产安全审计的管理系统。',
        '通过邮件联系时，您使用的邮件服务商及接收邮箱所使用的 QQ 邮箱服务会处理邮件传输、存储等必要信息，其各自规则适用。该类邮件并非仅保留在您的浏览器中。',
        'GitHub、社区及其他外部链接由第三方提供。主动在公开 Issue、讨论区或社区发布内容可能使昵称、正文、附件等被他人查看、复制或检索；请不要在公开渠道提交隐私请求所需的敏感证明材料。',
        '未来如需委托服务商处理、向其他处理者提供、公开披露信息，或因服务转移而移交信息，应依法说明目的、类别、接收方及相关权利，并履行必要的合同约束、告知和同意程序。依法响应有效的司法或行政要求时，应限于合法、必要的范围。',
      ] },
      { id: 'privacy-retention', title: '保存期限与删除后的影响', paragraphs: [
        '当前本地数据未设置统一的自动到期清除机制，通常保留至您通过功能删除、清除本站浏览器数据，或浏览器自行回收存储。退出登录仅清除相应登录状态，不会删除账号、订单、文件或全部其他资料。',
        '当前注销账号仅移除该账号记录和登录状态，不会级联删除已存订单、工单、作品、举报、收款与提现记录或 IndexedDB 文件。旧版本保存的收款方式可能仍留存在浏览器中，当前版本不再读取或更新这些数据；如需删除，请清除本站浏览器数据。请不要将账号注销视为完整的数据删除。',
        '如需清除当前设备上的完整本地副本，请先备份需要保留的素材和记录，再使用浏览器的站点数据设置清除本网站的 localStorage 和 IndexedDB。此操作可能同时清除同一浏览器配置下本站其他演示账号的资料，并且通常无法撤销；其他浏览器、设备、已下载文件、您自行制作的备份及已发送邮件需分别处理。',
        '您发送的邮件及我们持有的往来信息，以解决请求、履行适用法定义务及处理争议所必要的期间为限；不再必要时应删除或匿名化。当前没有已核实的统一天数可供披露。未来联网服务须根据数据类别、业务目的和法定要求确定并公开相应保存期限或判断标准。',
      ] },
      { id: 'privacy-rights', title: '查阅、更正、删除与其他权利', paragraphs: [
        '您可在账号、设置、订单、客服和工作室等对应界面查看或修改当前功能支持的信息。对于界面不支持的操作，您可通过 2310502033@qq.com 提出查阅、复制、更正、删除、撤回同意、限制或反对处理等请求；具体权利及适用条件依适用法律确定。',
        '请说明请求事项、涉及的功能及便于回复的联系方式。为防止冒名操作，我们可能要求与请求风险相称的必要核实，但不会要求您提供登录密码或支付验证码；不应主动发送过量身份证明。我们会在适用法律规定的期限内响应，无法全部办理时说明原因及可行的替代方式。',
        '本地原型中的资料没有自动上传给我们。仅凭邮件无法远程读取、导出或删除您设备中的浏览器数据，我们会说明可由您执行的本地操作；对于我们实际持有的邮件等信息，将按请求及适用法律处理。清理本地数据本身不会删除邮件服务商持有的副本。',
        '如对处理结果有异议，您可继续通过上述邮箱反馈；也可依适用法律向有权监管机关投诉或寻求其他法定救济。本政策不限制您的法定权利。',
      ] },
      { id: 'privacy-security', title: '安全措施与原型局限', paragraphs: [
        '当前的密码摘要、账号关联和界面权限用于演示流程，并不构成生产级身份认证、数据库隔离或金融数据保护。localStorage 和 IndexedDB 不提供本网站层面的端到端加密；可访问同一浏览器配置的人、同源脚本或被授予相应权限的扩展可能接触其中数据。请勿在共享设备中保留真实个人资料。',
        '我们应采取与实际处理风险相适应的访问控制、最小权限和必要的技术及管理措施；但任何系统均无法保证绝对安全。当前页面的存在不表示已完成生产安全审计、灾备建设或合规认证。',
        '如发现可能涉及个人信息的安全事件，将核实影响、采取合理补救，并根据适用法律履行向受影响人员和主管机关的通知义务。发现异常时，请通过隐私联系邮箱反馈，避免在公开渠道披露漏洞涉及的个人信息。',
      ] },
      { id: 'privacy-location', title: '数据存放与跨境情形', paragraphs: [
        '本地原型资料主要存放于您使用的设备浏览器中；邮件、网站访问请求和您主动访问的第三方服务可能涉及其各自的服务器。本政策不将“本地保存”表述为所有信息均保存在某一国家或地区的保证。',
        '当前尚未核实网站托管、邮件及未来后台各服务的数据存放地区和跨境路径。在启用由我们安排的跨境个人信息处理前，应核实接收方、目的、类别、地点与适用规则，并依法完成必要的告知、单独同意及其他保护程序。',
      ] },
      { id: 'privacy-minors', title: '未成年人保护', paragraphs: [
        '本网站并非专门面向儿童提供服务，当前未部署年龄核验机制。未成年人使用账号、发布或交易相关功能，应遵守所在地关于年龄、民事行为能力及监护人同意的要求；未满十四周岁用户在适用中国大陆法律时，应在监护人指导并取得必要同意后处理个人信息。',
        '请勿在原型中提交儿童的真实个人信息。监护人如发现儿童资料被不当提供，可联系我们；对于我们实际持有的信息，将依法核实并采取删除等必要措施，对仅在设备中保存的数据则提供本地清理说明。',
      ] },
      { id: 'privacy-changes', title: '政策更新与联系方式', paragraphs: [
        '本页标明版本和更新日期，当前为待发布草案，未宣告联网服务的生效日期。实际功能、处理目的、信息类别、接收方或权利行使方式发生重要变化时，应在相关处理实施前更新政策，并通过页面提示等适当方式告知；需要重新取得同意的，不以静默更新替代。',
        '隐私咨询、个人信息权利请求及安全问题，请发送至 2310502033@qq.com，并在主题中注明“隐私政策”及请求类型。我们不会仅因您提出隐私请求而要求您购买服务或放弃法定权利。',
      ] },
    ],
  },
  en: {
    title: 'Privacy Policy',
    version: '1.0 — Draft for publication',
    updated: 'Updated: September 22, 2026',
    notice: 'This policy describes the current website prototype. Accounts, transactions and withdrawals are local demonstrations, without live payment or account services. Use test details, not real financial accounts or passwords used elsewhere. Before connected services launch, the actual data controller and required disclosures, providers, retention and storage locations must be verified and this policy updated. This draft does not mean those launch requirements have been completed.',
    sections: [
      { id: 'privacy-scope', title: 'Scope and principles', paragraphs: [
        'This policy covers the MoonSprite website, including browsing, accounts, the asset market, purchase history, creator studio and support features. “We” means the people maintaining and providing this website; it does not imply an incorporated company or registered entity. Contact us about privacy at 2310502033@qq.com.',
        'This policy does not automatically cover the MoonSprite desktop application, GitHub, community websites or independently operated third-party services. Their own privacy rules apply when you use them. Asset permissions and transaction rights are addressed separately in the licence agreement.',
        'We follow purpose limitation, data minimisation and transparency. Reading this policy or continuing to browse is not consent to every processing activity, nor blanket authorisation for sensitive-data processing or international transfers. Any legally required consent, separate consent or other procedure must be completed before the relevant processing.',
      ] },
      { id: 'privacy-data', title: 'Information, purposes and necessity', paragraphs: [
        'Browsing and preferences: browser language determines the initial display language. Your chosen language, theme, cart product identifiers and quantities preserve preferences and shopping progress. Public pages can be viewed without registering.',
        'Accounts and sign-in: registration requires a display name, email and password to create a local demonstration account; sign-in checks email and password locally. Stored fields include an account identifier, name, email, creation time, verification status and password digest, rather than a plaintext password field. The current digest scheme is not production-grade password protection. Without required registration fields you cannot create an account, but can still browse public content.',
        'Orders and support: demonstration orders contain account associations, order identifiers, products, amounts, times and statuses to display purchase, order and download workflows. Support tickets contain a subject, message, associated order, timestamps, status and replies to demonstrate support handling. Orders do not charge real money and tickets are not automatically delivered to remote support.',
        'Creation and moderation: listing details, author information, prices, covers and selected asset files support previews, demonstration publishing and downloads. File records include names, types, sizes, contents and update times. Report reasons, details, reporter associations and moderation results support content-management demonstrations. Do not include unrelated personal data or unauthorised information about others in content, files or reports.',
        'Payouts and withdrawals: the Alipay account and verified name entered for each request, along with amounts, times, statuses and destinations, support settlement demonstrations. There are no standalone payout-method settings; destination details are saved with each withdrawal. Financial-account information may be sensitive personal information. There is no real account verification, payment-provider integration or transfer; use test values only. The full Alipay account and name are stored unencrypted in local withdrawal records.',
        'Email: when you contact us, your sender address, message, attachments and necessary correspondence are used to reply, investigate and handle your request. Do not send passwords, payment codes, full financial-account details, identity documents or other sensitive information unless genuinely necessary to resolve the matter.',
      ] },
      { id: 'privacy-storage', title: 'Browser storage, cookies and network requests', paragraphs: [
        'No account API is currently configured; account and transaction workflows use a local adapter. localStorage holds accounts and orders (moonsprite-accounts), sign-in state (moonsprite-session), studio listings and withdrawals (moonsprite-studio), and studio unlock state (moonsprite-studio-session). Closing a tab does not automatically erase these records.',
        'localStorage also holds the cart (moonsprite-market-cart), language (moonsprite-language), theme (moonsprite-site-theme), account- or guest-specific tickets (moonsprite-support:*), and reports and moderation data (moonsprite-moderation).',
        'Files selected and saved through asset upload are stored in the packs store of the moonsprite-files IndexedDB database in your browser. In this prototype, “upload” and “publish” do not mean files have reached a remote server or become visible to users on other devices. Browser storage is not a reliable backup; clearing, eviction or device failure can cause loss.',
        'The current application code integrates no advertising tracking or third-party analytics SDK and does not use cookies for local sign-in; localStorage is distinct from cookies. Current pages do not request location, contacts, camera or microphone permissions. This does not establish that hosting infrastructure or external websites never use logs or cookies.',
        'Loading the website and static resources, or visiting external links and download addresses, sends requests to the relevant servers. Requests may include IP addresses, times, browser headers and referrer information, depending on browser and server settings. Hosting log fields, retention and locations have not been verified, so we do not promise that browsing generates no network data.',
      ] },
      { id: 'privacy-basis', title: 'Processing grounds and choices', paragraphs: [
        'Depending on applicable law and the activity, necessary processing may rely on providing a service you request, meeting a legal obligation or obtaining valid consent. This policy does not replace specific notices required by law, or expand processing through a general claim of business need. Local demonstrations do not establish real transaction contracts, payment authorisations or marketing subscriptions.',
        'You may choose not to register, submit tickets, provide settlement details or select files. Related demonstrations may then be unavailable, but public pages remain accessible. Where processing legally relies on consent, you may withdraw it without affecting the validity of processing based on consent before withdrawal.',
        'Any future optional analytics, marketing, sensitive-data processing or new purpose should be explained before activation, with appropriate consent where required. Refusing unnecessary processing will not by itself justify denying unrelated basic services.',
      ] },
      { id: 'privacy-sharing', title: 'Disclosure, publication and third parties', paragraphs: [
        'The current implementation has no functionality for selling personal data, advertising profiling or automatically synchronising local accounts and orders with third parties. No real payment or settlement provider is integrated. Local administration screens can view demonstration records; they are not evidence of deployed remote support or a production-audited administration system.',
        'Emailing us involves your mail provider and QQ Mail, which serves the receiving mailbox, processing information for transmission and storage under their respective rules. Such correspondence is not confined to your browser.',
        'GitHub, community websites and other external destinations are operated by third parties. Public issues, discussions and posts may expose names, text and attachments to viewing, copying or indexing. Do not submit sensitive evidence for a privacy request through public channels.',
        'Before future processing by vendors, disclosure to other controllers, public disclosure or transfer associated with a service transfer, legally required information about purposes, categories, recipients and rights must be provided, alongside necessary contractual safeguards, notices and consent. Responses to valid judicial or administrative requirements should be confined to what is lawful and necessary.',
      ] },
      { id: 'privacy-retention', title: 'Retention and deletion effects', paragraphs: [
        'Local records currently have no uniform automatic expiry. They generally remain until removed through available features, cleared in browser site settings or evicted by the browser. Signing out removes the corresponding session state, not accounts, orders, files or all other records.',
        'Account deletion currently removes the account record and session only. It does not cascade to existing orders, tickets, listings, reports, payout and withdrawal records, or IndexedDB files. Payout methods saved by older versions may remain in browser storage; this version no longer reads or updates them. Clear site data to remove those legacy records. Account deletion is therefore not complete data erasure.',
        'To remove the complete local copy on this device, first back up materials and records you need, then clear this website’s localStorage and IndexedDB using browser site-data settings. This can also erase other demonstration accounts under the same site and browser profile and is usually irreversible. Other browsers, devices, downloads, personal backups and sent emails must be handled separately.',
        'Emails and correspondence we hold should be retained only as necessary to resolve requests, meet applicable legal obligations and handle disputes, then deleted or anonymised when no longer necessary. No verified uniform number of days is currently available. Connected services must determine and disclose retention periods or criteria by category, purpose and legal requirement before launch.',
      ] },
      { id: 'privacy-rights', title: 'Access, correction, erasure and other rights', paragraphs: [
        'You can view or edit information supported by the account, settings, orders, support and studio screens. For operations not available there, email 2310502033@qq.com to request access, a copy, correction, erasure, withdrawal of consent, restriction or objection. Available rights and conditions depend on applicable law.',
        'Describe your request, the relevant feature and a reply address. We may require verification proportionate to the risk of impersonation, but will not ask for sign-in passwords or payment codes. Do not volunteer excessive identity evidence. We will respond within applicable statutory time limits and explain any inability to fully comply and available alternatives.',
        'Local prototype records are not automatically uploaded to us. An email does not enable us to remotely read, export or erase your browser data; we can explain local steps you can take. We will handle information we actually hold, such as emails, in accordance with your request and applicable law. Clearing browser data does not erase copies held by mail services.',
        'You may raise concerns about our response through the same mailbox, complain to a competent regulator or pursue other remedies available under applicable law. This policy does not limit statutory rights.',
      ] },
      { id: 'privacy-security', title: 'Security and prototype limitations', paragraphs: [
        'Password digests, account associations and interface permissions currently demonstrate workflows; they are not production-grade authentication, database isolation or financial-data protection. localStorage and IndexedDB do not provide website-level end-to-end encryption. People with access to the same browser profile, same-origin scripts or appropriately privileged extensions may access records. Do not retain real personal data on shared devices.',
        'Access controls, least privilege and appropriate technical and organisational measures should reflect actual processing risks. No system can guarantee absolute security. These pages do not establish completion of production security audits, disaster recovery or compliance certification.',
        'If a potential personal-data security incident is identified, we will investigate its impact, take reasonable remedial measures and meet applicable notification duties to affected people and authorities. Report concerns to the privacy mailbox without publishing affected personal information in public channels.',
      ] },
      { id: 'privacy-location', title: 'Storage locations and international transfers', paragraphs: [
        'Local prototype records are primarily stored in the browser on your device. Email, website requests and third-party services you visit may involve their respective servers. Local storage is not a guarantee that all information remains in a particular country or region.',
        'Storage locations and transfer paths for hosting, email and future backend services have not yet been verified. Before arranging international personal-data processing, recipients, purposes, categories, locations and applicable rules must be checked, with legally required notices, separate consent and other safeguards completed.',
      ] },
      { id: 'privacy-minors', title: 'Children and minors', paragraphs: [
        'The website is not specifically directed at children and currently has no age-verification system. Minors using account, publishing or transaction features must follow local requirements on age, legal capacity and guardian consent. Where mainland Chinese law applies, processing information about children under fourteen requires appropriate guardian involvement and necessary consent.',
        'Do not submit real children’s personal information to the prototype. Guardians who identify inappropriate submissions can contact us. For information we actually hold, we will verify and take necessary measures such as deletion under applicable law; for device-only records, we will provide local clearing instructions.',
      ] },
      { id: 'privacy-changes', title: 'Updates and contact', paragraphs: [
        'This page states its version and update date. It is a draft for publication, not an announcement of an effective date for connected services. Material changes to features, purposes, information categories, recipients or rights procedures should be reflected before the relevant processing and communicated through appropriate notices. A silent update cannot replace renewed consent where required.',
        'For privacy questions, rights requests or security concerns, email 2310502033@qq.com with “Privacy Policy” and the request type in the subject. Making a privacy request will not by itself require you to purchase services or waive statutory rights.',
      ] },
    ],
  },
}
