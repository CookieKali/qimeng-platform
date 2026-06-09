"""应用配置 - 从环境变量加载"""
import os
import secrets
from typing import List
from pydantic_settings import BaseSettings


# 保存生成的默认密钥，避免每次调用都生成新的
_DEFAULT_SECRET = secrets.token_urlsafe(32)


class Settings(BaseSettings):
    APP_NAME: str = "企盟 Qimeng Platform"
    APP_ENV: str = "dev"
    SECRET_KEY: str = _DEFAULT_SECRET
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 7 * 24 * 60
    DATABASE_URL: str = "sqlite:///./qimeng.db"
    CORS_ORIGINS: str = "*"

    # 支付：mock（演示）| wechat（生产）
    PAYMENT_MODE: str = "mock"
    ENABLE_MOCK_PAY: bool = True

    # 微信小程序
    WECHAT_APP_ID: str = ""
    WECHAT_APP_SECRET: str = ""

    # 微信支付 APIv3
    WECHAT_MCH_ID: str = ""
    WECHAT_API_V3_KEY: str = ""
    WECHAT_MCH_CERT_SERIAL: str = ""
    WECHAT_MCH_PRIVATE_KEY_PATH: str = ""
    WECHAT_NOTIFY_URL: str = ""

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    def validate_secret_key(self) -> None:
        """生产环境必须配置密钥"""
        if self.APP_ENV == "prod" and self.SECRET_KEY == _DEFAULT_SECRET:
            raise ValueError("生产环境必须通过环境变量配置 SECRET_KEY")

    @property
    def allow_mock_pay(self) -> bool:
        return self.APP_ENV != "prod" and self.ENABLE_MOCK_PAY

    @property
    def use_wechat_pay(self) -> bool:
        return (self.PAYMENT_MODE or "mock").lower() == "wechat"

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
# 启动时验证密钥配置
if settings.APP_ENV == "prod":
    settings.validate_secret_key()
