"""企盟演示数据种子 - 从 qimeng_app_v9.html 提取的15位成员+活动+任务+空间站"""
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from ..models.user import User
from ..models.card import Card
from ..models.activity import Activity, ActivityCheckin
from ..models.space import Space, Station, StationShareholder, Booking
from ..models.task import Task
from ..models.friend import FriendRelation, FriendRequest
from ..models.contribution import ContributionPoint
from ..models.credit import CreditTransaction
from ..models.profit import ChannelRelation, ProfitSharingRecord, StationProfitSettlement
from ..models.reputation import ReputationTag
from ..core.security import hash_password


MEMBERS = [
    ("18761625888", "张一格", "企盟创始人", "企盟生态", "互联网", "上海", "partner", "SSS", True,
     "上海市嘉定区北虹桥新能源产业园", "系统设计、跨界创业、战略读书", "系统搭建·组织架构·资源整合",
     ["创业导师", "资源整合"]),
    ("13900000002", "王丽华", "CEO", "华创新能源", "新能源", "上海", "paid", "SS", True,
     "上海市浦东新区", "新能源研究、户外运动", "产业协同·海外拓展", ["工商储能", "出海"]),
    ("13000000003", "李建明", "销售总监", "快马零售", "零售", "广州", "normal", "A", False,
     "广州市天河区", "商业模式研究、高尔夫", "渠道拓展·大客户销售", ["渠道", "客户"]),
    ("13700000004", "陈晓云", "合伙律师", "云达律所", "法律", "深圳", "mentor", "S", True,
     "深圳市南山区", "法律研究、钢琴", "股权架构·投融资法务", ["股权设计", "融资法务"]),
    ("13500000005", "刘宇航", "CFO", "星桥资本", "金融", "北京", "investor", "SS", True,
     "北京市朝阳区", "量化投资、马拉松", "财务建模·投融资决策", ["投融资", "现金流"]),
    ("13600000006", "赵梦琪", "品牌总监", "新食代", "食品", "成都", "normal", "B", False,
     "成都市高新区", "品牌设计、烘焙", "品牌策划·连锁体系搭建", ["品牌", "连锁运营"]),
    ("13800000007", "孙志强", "投资合伙人", "远见创投", "金融", "上海", "investor", "S", True,
     "上海市静安区", "科技趋势、红酒", "项目判断·资本运作", ["天使投资", "并购"]),
    ("13100000008", "周敏", "运营总监", "潮玩文创", "零售", "深圳", "normal", "A", False,
     "深圳市福田区", "潮流文化、手办收藏", "IP运营·新零售", ["新零售", "IP运营"]),
    ("13200000009", "吴海涛", "技术VP", "智云科技", "互联网", "北京", "mentor", "SS", True,
     "北京市海淀区", "开源技术、围棋", "系统架构·AI工程", ["AI", "架构"]),
    ("13300000010", "郑丽君", "主治医师", "协和医院", "医疗", "广州", "mentor", "A", False,
     "广州市越秀区", "医学研究、瑜伽", "健康管理·医美咨询", ["健康管理", "医美"]),
    ("13400000011", "黄文斌", "工厂厂长", "恒达制造", "制造业", "成都", "normal", "B", False,
     "成都市龙泉驿区", "精益生产、钓鱼", "供应链管理·智能制造", ["供应链", "智造"]),
    ("13900000012", "林晓东", "培训总监", "启明教育", "教育", "上海", "mentor", "S", True,
     "上海市闵行区", "教育研究、徒步", "企业培训·课程开发", ["企业培训", "课程"]),
    ("13800000013", "何静", "区域经理", "鲜丰生鲜", "零售", "北京", "normal", "B", False,
     "北京市丰台区", "美食、烹饪", "生鲜运营·社区团购", ["生鲜", "社区团购"]),
    ("13700000014", "罗志明", "法务总监", "华信集团", "法律", "广州", "mentor", "SS", True,
     "广州市天河区", "法律研究、太极", "合规建设·知识产权", ["合规", "知识产权"]),
    ("13600000015", "杨梅", "创始人", "绿源农业", "食品", "成都", "partner", "S", True,
     "成都市郫都区", "有机种植、烘焙", "生态农业·品牌建设", ["生态农业", "品牌"]),
]


def maybe_seed(db: Session):
    if db.query(User).count() > 0:
        return
    print("[seed] 初始化演示数据...")

    users = []
    for i, (phone, name, job, co, ind, region, role, lv, paid, addr, inter, talent, tags) in enumerate(MEMBERS):
        u = User(
            phone=phone, password_hash=hash_password("123456"),
            name=name, role=role, is_paid=paid,
            paid_at=datetime.utcnow() if paid else None,
            invite_code=f"QM-2026-{i+1:03d}",
            inviter_id=1 if i > 0 else None,
            reputation_level=lv,
            reputation_initiator={"SSS": 920, "SS": 850, "S": 770, "A": 650, "B": 540, "C": 430}.get(lv, 600),
            reputation_executor={"SSS": 920, "SS": 850, "S": 770, "A": 650, "B": 540, "C": 430}.get(lv, 600),
            credit_balance=10000 if paid else 1000,
            contribution_balance=500 + i * 30,
            email=f"user{i+1}@qimeng.demo",
            avatar_url="",
        )
        db.add(u)
        db.flush()
        users.append(u)

        c = Card(
            user_id=u.id, company=co, job_title=job, industry=ind, region=region,
            bio=f"{co}·{job}", interests=inter, talents=talent, tags=tags,
            resources=["人脉资源", "产业经验"], needs=["项目对接", "融资合作"],
            social_titles=[{"title": "中国创业者协会", "duty": "会员", "since": "2023"}] if paid else [],
            honors=[{"name": "年度优秀创业者", "year": "2024"}] if lv in ("SSS", "SS") else [],
            business_map=[{"co": co, "position": job, "biz": f"{ind}领域业务",
                           "addr": addr, "product": "核心产品/服务"}],
            status_supply=f"可提供{tags[0]}相关合作机会" if tags else "",
            status_demand="寻找产业合作伙伴",
        )
        db.add(c)

        # 充值流水
        if paid:
            db.add(CreditTransaction(user_id=u.id, type="recharge", amount=10000,
                                     balance_before=0, balance_after=10000, note="初始充值"))

        # 部分用户挂专业标签
        if lv in ("SSS", "SS", "S"):
            db.add(ReputationTag(user_id=u.id, tag_name=f"{tags[0]}-高好评", tag_level="L2"))

    # 创建空间站
    station = Station(name="企盟·北外滩空间站", level="city", region="上海",
                      address="上海市虹口区北外滩", description="区域商业枢纽·苏里联席模式样板店",
                      operator_id=users[0].id, member_count=520,
                      shareholder_count=20, annual_revenue=15500000)
    db.add(station)
    db.flush()

    station2 = Station(name="企盟·浦东空间站", level="city", region="上海",
                       address="上海市浦东新区张江高科", description="科技创新型空间站",
                       operator_id=users[1].id, member_count=300, shareholder_count=18,
                       annual_revenue=7200000)
    db.add(station2)
    db.flush()

    # 联席股东（前6个用户都成为北外滩股东，代表20股东中的种子）
    industries = ["股权投资", "新能源", "零售渠道", "法律服务", "金融资本", "新消费"]
    for i, u in enumerate(users[:6]):
        db.add(StationShareholder(station_id=station.id, user_id=u.id,
                                  shares=1.0, invest_amount=200000,
                                  industry=industries[i], rights_mask=0b1111111111))

    # 空间
    spaces_data = [
        ("北外滩主厅", "多功能厅", 60, "上海市虹口区北外滩", 300, ["投影", "白板", "茶水"]),
        ("北外滩会议室A", "会议室", 12, "上海市虹口区北外滩", 150, ["视频会议", "白板"]),
        ("北外滩路演厅", "路演厅", 80, "上海市虹口区北外滩", 500, ["音响", "舞台", "屏幕"]),
        ("浦东共享办公", "联合办公", 30, "上海市浦东新区", 100, ["WiFi", "打印", "咖啡"]),
        ("浦东会议室B", "会议室", 20, "上海市浦东新区", 200, ["视频会议", "白板"]),
    ]
    space_objs = []
    for idx, (name, type_, cap, addr, price, fac) in enumerate(spaces_data):
        sp = Space(station_id=station.id if idx < 3 else station2.id,
                   name=name, type=type_, capacity=cap, address=addr,
                   price_per_hour=price, facilities=fac,
                   description=f"{name}·全功能商务空间", rating=4.8)
        db.add(sp)
        space_objs.append(sp)
    db.flush()

    # 活动
    now = datetime.utcnow()
    activities_data = [
        ("2026新能源出海论坛", "聚焦欧洲与东南亚市场，邀请20+产业头部嘉宾", users[1].id,
         space_objs[0].id, station.id, now + timedelta(days=7), 100),
        ("FA撮合·投融资闭门会", "20位投资人与15个早期项目1对1对接", users[4].id,
         space_objs[2].id, station.id, now + timedelta(days=14), 80),
        ("企盟·苏里联席模式沙龙", "解构链接者操作系统的底层逻辑", users[0].id,
         space_objs[0].id, station.id, now + timedelta(days=3), 60),
        ("AI企业服务产业沙龙", "面向中小企业的AI落地方案", users[8].id,
         space_objs[3].id, station2.id, now + timedelta(days=10), 40),
        ("生态农业品牌路演", "杨梅创始人主导的新消费品牌路演", users[14].id,
         space_objs[2].id, station.id, now + timedelta(days=21), 70),
    ]
    act_objs = []
    for title, desc, host, sp_id, st_id, start_at, cap in activities_data:
        a = Activity(host_id=host, space_id=sp_id, station_id=st_id,
                     title=title, description=desc, capacity=cap,
                     location="北外滩空间站", start_at=start_at,
                     end_at=start_at + timedelta(hours=3),
                     signup_deadline=start_at - timedelta(days=1))
        db.add(a)
        act_objs.append(a)
    db.flush()

    # 报名签到
    for a in act_objs[:3]:
        for u in users[:6]:
            db.add(ActivityCheckin(activity_id=a.id, user_id=u.id,
                                   checked_in_at=now if a.start_at < now else None))

    # 任务
    tasks_data = [
        ("Logo设计·新消费品牌", "设计", "为新食代品牌设计logo和VI", users[5].id, 3, 800, 2400, "S"),
        ("企业咨询·股权架构", "咨询", "陈律师为企业提供股权架构搭建咨询", users[3].id, 1, 5000, 5000, "S"),
        ("AI项目可行性分析", "技术", "智云科技AI落地方案可行性分析", users[8].id, 2, 3000, 6000, "A"),
        ("年终活动招商方案", "运营", "招募赞助商，提供完整招商方案", users[7].id, 1, 2000, 2000, "B"),
        ("生态农业品牌全案", "市场", "为绿源农业提供全案品牌策划", users[14].id, 1, 4500, 4500, "A"),
        ("法律合规审查·投融资", "法务", "罗志明法务总监主导，企业合规审查", users[13].id, 1, 6000, 6000, "S"),
    ]
    task_objs = []
    for title, cat, desc, host, quota, base, pool, lv in tasks_data:
        t = Task(host_id=host, title=title, category=cat, description=desc,
                 total_quota=quota, max_quota_per_person=1,
                 signup_deadline=now + timedelta(days=3),
                 deliver_deadline=now + timedelta(days=14),
                 min_reputation_level=lv,
                 required_tags=[],
                 qualified_threshold="按需求文档规定标准交付",
                 total_credit_pool=pool, base_credit_per_person=base,
                 satisfaction_ratio_map={"90": 110, "80": 100, "60": 80, "0": 30},
                 appeal_rules="任务结束后3个工作日内可申诉",
                 credit_frozen=True)
        db.add(t)
        task_objs.append(t)
    db.flush()

    # 好友关系（前6人互为好友）
    for i, a in enumerate(users[:6]):
        for j, b in enumerate(users[:6]):
            if i != j:
                db.add(FriendRelation(user_id=a.id, friend_id=b.id,
                                      group_name="生态伙伴", scene="recommend"))

    # 渠道关系
    for i, u in enumerate(users[1:8], 1):
        db.add(ChannelRelation(referrer_id=users[0].id, referee_id=u.id,
                               relation_type="recommend"))

    # 贡献积分流水
    for u in users[:6]:
        db.add(ContributionPoint(user_id=u.id, source_type="invite_register",
                                 amount=50, balance=u.contribution_balance,
                                 note="推荐新用户注册"))

    # 分润流水（演示）
    period = now.strftime("%Y-%m")
    for u in users[:4]:
        db.add(ProfitSharingRecord(user_id=u.id, period=period,
                                   income_source="referral", source_amount=10000,
                                   percentage=20.0, amount=2000,
                                   status="paid", tx_hash=f"0x{u.id:064x}",
                                   note="推荐合伙人会费分润"))
        # station_dividend 由 admin /profit/settle 按当月 platform_pool 生成，种子不预置

    # 空间站结算（占位，settle 会按真实 member_fee 更新 net_profit / distributed_amount）
    db.add(StationProfitSettlement(
        station_id=station.id, period=period,
        total_revenue=1500000, cost=850000, net_profit=650000,
        shareholder_dividend_rate=4.0, distributed_amount=0,
        breakdown={"到店消费": 700000, "项目FA": 400000, "运营增值": 200000,
                   "合伙人相关": 150000, "其他": 50000},
    ))

    db.commit()
    print(f"[seed] 完成 - {len(users)}用户 / {len(act_objs)}活动 / {len(task_objs)}任务 / 2空间站")


DEMO_PHONE = "123456"
DEMO_PASSWORD = "123456"

# 管控后台结算等接口需 super_admin
ADMIN_PHONE = "19900000000"
ADMIN_PASSWORD = "123456"

# 好友功能联调专用：两人互不预设好友关系，申请/待办均走 friend_requests 表
TEST_FRIEND_USERS = [
    {
        "phone": "18800000001",
        "name": "测试用户甲",
        "job_title": "产品经理",
        "company": "甲创科技",
        "industry": "互联网",
        "region": "上海",
        "invite_code": "QM-TEST-001",
    },
    {
        "phone": "18800000002",
        "name": "测试用户乙",
        "job_title": "技术总监",
        "company": "乙联软件",
        "industry": "互联网",
        "region": "北京",
        "invite_code": "QM-TEST-002",
    },
]
TEST_FRIEND_PASSWORD = "123456"


def ensure_demo_user(db: Session):
    """确保最简单演示账号存在（账号密码均为 123456），每次启动同步密码。"""
    pwd_hash = hash_password(DEMO_PASSWORD)
    user = db.query(User).filter(User.phone == DEMO_PHONE).first()
    if user:
        user.password_hash = pwd_hash
        user.status = "active"
        if not user.card:
            db.add(Card(
                user_id=user.id, company="企盟演示", job_title="体验账号",
                industry="互联网", region="上海", bio="演示账号·数据来自后端 API",
            ))
        db.commit()
        return

    user = User(
        phone=DEMO_PHONE,
        password_hash=pwd_hash,
        name="演示用户",
        role="partner",
        is_paid=True,
        paid_at=datetime.utcnow(),
        invite_code="QM-DEMO-001",
        reputation_level="SSS",
        reputation_initiator=920,
        reputation_executor=920,
        credit_balance=10000,
        contribution_balance=500,
        email="demo@qimeng.demo",
    )
    db.add(user)
    db.flush()
    db.add(Card(
        user_id=user.id, company="企盟演示", job_title="体验账号",
        industry="互联网", region="上海", bio="演示账号·数据来自后端 API",
        interests="产品体验", talents="快速上手",
        tags=["演示"],
        resources=["人脉资源"], needs=["项目对接"],
    ))
    db.add(CreditTransaction(
        user_id=user.id, type="recharge", amount=10000,
        balance_before=0, balance_after=10000, note="演示账号初始积分",
    ))

    # 与已有种子用户建立好友，便于通讯录看到真实后端数据
    others = db.query(User).filter(User.id != user.id, User.status == "active").limit(5).all()
    for other in others:
        if not db.query(FriendRelation).filter(
            FriendRelation.user_id == user.id, FriendRelation.friend_id == other.id
        ).first():
            db.add(FriendRelation(user_id=user.id, friend_id=other.id, group_name="演示好友", scene="demo"))
            db.add(FriendRelation(user_id=other.id, friend_id=user.id, group_name="演示好友", scene="demo"))

    db.commit()
    print(f"[seed] 演示账号已就绪: {DEMO_PHONE} / {DEMO_PASSWORD}")


def ensure_super_admin(db: Session):
    """确保超级管理员存在，用于 /api/admin/* 等接口联调。"""
    pwd_hash = hash_password(ADMIN_PASSWORD)
    user = db.query(User).filter(User.phone == ADMIN_PHONE).first()
    if user:
        user.password_hash = pwd_hash
        user.role = "super_admin"
        user.status = "active"
        user.name = user.name or "系统管理员"
        if not user.invite_code:
            user.invite_code = "QM-2026-ADMIN"
        db.commit()
        print(f"[seed] 超级管理员已就绪: {ADMIN_PHONE} / {ADMIN_PASSWORD}")
        return

    user = User(
        phone=ADMIN_PHONE,
        password_hash=pwd_hash,
        name="系统管理员",
        role="super_admin",
        status="active",
        invite_code="QM-2026-ADMIN",
        reputation_level="SSS",
        reputation_initiator=900,
        reputation_executor=900,
        email="admin@qimeng.demo",
    )
    db.add(user)
    db.flush()
    db.add(Card(
        user_id=user.id, company="企盟平台", job_title="超级管理员",
        industry="平台", region="上海", bio="管控后台演示账号",
    ))
    db.commit()
    print(f"[seed] 超级管理员已创建: {ADMIN_PHONE} / {ADMIN_PASSWORD}")


def ensure_test_friend_users(db: Session):
    """确保两个好友联调账号存在，且彼此不是好友（申请数据来自 friend_requests）。"""
    pwd_hash = hash_password(TEST_FRIEND_PASSWORD)
    created_ids = []

    for spec in TEST_FRIEND_USERS:
        user = db.query(User).filter(User.phone == spec["phone"]).first()
        if user:
            user.password_hash = pwd_hash
            user.status = "active"
            user.name = spec["name"]
            if user.card:
                user.card.job_title = spec["job_title"]
                user.card.company = spec["company"]
                user.card.industry = spec["industry"]
                user.card.region = spec["region"]
            created_ids.append(user.id)
            continue

        user = User(
            phone=spec["phone"],
            password_hash=pwd_hash,
            name=spec["name"],
            role="normal",
            is_paid=False,
            invite_code=spec["invite_code"],
            reputation_level="A",
            reputation_initiator=650,
            reputation_executor=650,
            credit_balance=1000,
            contribution_balance=100,
            email=f"{spec['phone']}@qimeng.test",
        )
        db.add(user)
        db.flush()
        db.add(Card(
            user_id=user.id,
            company=spec["company"],
            job_title=spec["job_title"],
            industry=spec["industry"],
            region=spec["region"],
            bio=f"{spec['company']}·{spec['job_title']}",
            interests="产品、技术交流",
            talents="协作沟通",
            tags=["联调测试"],
            resources=["测试人脉"],
            needs=["好友联调"],
        ))
        created_ids.append(user.id)

    db.commit()
    print(
        "[seed] 好友联调账号: "
        + " / ".join(f"{u['phone']}" for u in TEST_FRIEND_USERS)
        + f" 密码均为 {TEST_FRIEND_PASSWORD}"
    )
