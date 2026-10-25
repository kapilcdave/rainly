from typing import Annotated, Optional

from bson import ObjectId
from pydantic import BaseModel, BeforeValidator, Field, ConfigDict

from core import now_iso

PyObjectId = Annotated[str, BeforeValidator(lambda v: str(v) if isinstance(v, ObjectId) else v)]


class BaseDocument(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: Optional[PyObjectId] = Field(default=None, alias="_id")

    @classmethod
    def from_mongo(cls, doc: dict):
        return cls.model_validate(doc)

    def to_mongo(self) -> dict:
        data = self.model_dump(by_alias=True, exclude={"id"})
        data.pop("_id", None)
        return data


class Merchant(BaseDocument):
    name: str
    business_type: str
    city: str
    avg_booking: float
    margin_pct: float = 20.0
    contact_email: Optional[str] = None  # for rain-chance alerts
    brand: Optional[str] = None  # locations sharing a brand roll up together
    last_alert_date: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


class Guarantee(BaseDocument):
    merchant_id: str
    customer_name: str
    booking_value: float
    kind: str
    date: str
    event_ticker: str
    ticker: str
    p: float
    fee_per_contract: float
    contracts: int
    hedge_cost: float
    price: float
    status: str = "active"  # active | refunded | expired
    depth_warning: bool = False
    customer_email: Optional[str] = None
    refund_email_status: Optional[str] = None  # pending | sending | sent | no_email | failed:<code> | gave_up
    refund_email_at: Optional[str] = None
    refund_email_attempts: int = 0
    created_at: str = Field(default_factory=now_iso)


class HedgeOrder(BaseDocument):
    merchant_id: str
    guarantee_id: Optional[str] = None
    ticker: str
    side: str = "yes"
    action: str = "buy"
    count: int
    price: float
    fee: float
    mode: str  # mock | kalshi_demo | kalshi_live
    status: str = "filled"
    filled: Optional[float] = None
    cost: Optional[float] = None  # dollars actually spent (live orders), counts toward the daily cap
    kalshi_order_id: Optional[str] = None
    note: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


class MerchantCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    business_type: str
    city: str
    avg_booking: float = Field(gt=0, le=10000)
    margin_pct: float = Field(default=20.0, ge=0, le=100)
    contact_email: Optional[str] = Field(default=None, max_length=200)
    brand: Optional[str] = Field(default=None, max_length=80)


class DeclineCreate(BaseModel):
    merchant_id: str


class GuaranteeCreate(BaseModel):
    merchant_id: str
    customer_name: str = Field(default="Guest", max_length=80)
    customer_email: Optional[str] = Field(default=None, max_length=200)
    booking_value: float = Field(gt=0, le=10000)
    kind: str = "weekend"
    date: Optional[str] = None
