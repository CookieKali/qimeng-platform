from typing import Optional, List, Dict, Any, Union

from pydantic import BaseModel


class ProfileUpdate(BaseModel):
    company: Optional[str] = None
    city: Optional[str] = None
    personal_value: Optional[str] = None
    talents_text: Optional[str] = None
    resources_text: Optional[str] = None
    needs_text: Optional[str] = None
    job_title: Optional[str] = None
    industry: Optional[str] = None
    region: Optional[str] = None
    roles: Optional[List[str]] = None
    honors: Optional[List[Union[str, Dict[str, Any]]]] = None
    business_map: Optional[List[Dict[str, Any]]] = None


class ProfileSaveAll(ProfileUpdate):
    name: Optional[str] = None
    email: Optional[str] = None
