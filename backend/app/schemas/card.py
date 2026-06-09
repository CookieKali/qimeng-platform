from typing import Optional, List, Dict, Any
from pydantic import BaseModel


class CardUpdate(BaseModel):
    company: Optional[str] = None
    job_title: Optional[str] = None
    industry: Optional[str] = None
    region: Optional[str] = None
    city: Optional[str] = None
    bio: Optional[str] = None
    personal_value: Optional[str] = None
    talents_text: Optional[str] = None
    resources_text: Optional[str] = None
    needs_text: Optional[str] = None
    interests: Optional[str] = None
    talents: Optional[str] = None
    resources: Optional[List[str]] = None
    needs: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    social_titles: Optional[List[Dict[str, Any]]] = None
    honors: Optional[List[Dict[str, Any]]] = None
    business_map: Optional[List[Dict[str, Any]]] = None
    qualifications: Optional[List[Dict[str, Any]]] = None
    privacy: Optional[Dict[str, str]] = None


class StatusUpdate(BaseModel):
    status_supply: Optional[str] = None
    status_demand: Optional[str] = None
