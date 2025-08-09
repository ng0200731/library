---
type: "manual"
---

# 🎯 COMPLETE VERSION MANAGEMENT PROTOCOL

## ✅ CONFIRMED! Mandatory Protocol for EVERY Code Change

I understand and will follow this exact protocol for **EVERY** code change:

### 📋 Mandatory Workflow for ALL Code Changes:

#### 1. Version Increment Strategy:
- ✅ **EVERY code change = Version increment** (even smallest fixes)
- **Patch increment** for small fixes: `1.7.1 → 1.7.2`
- **Minor increment** for new features: `1.7.1 → 1.8.0`
- **Major increment** for breaking changes: `1.7.1 → 2.0.0`

#### 2. Commit Message Format:
- ✅ **DETAILED descriptions required**
- **Format**: `v#.#.# - [Detailed description of what was changed and why]`
- **Examples**:
  - `v1.7.2 - Fixed upload confirmation dialog styling and improved user guidance`
  - `v1.8.0 - Added delete all functionality with confirmation dialog`
  - `v2.0.0 - Restructured API endpoints with breaking changes to search parameters`

#### 3. Testing Requirement:
- ✅ **ALWAYS test in browser before committing**
- Verify functionality works as expected
- Check version display updates correctly in UI
- Confirm no compilation errors
- Test all affected features thoroughly

### 🎯 Complete Workflow Steps:
For **EVERY** code change, I will:

1. **Update package.json version** (increment appropriately)
2. **Make code changes**
3. **Test in browser** (open URL and verify functionality)
4. **Verify version display** shows new version in UI
5. **Execute git workflow**:
   - `git add .`
   - `git commit -m "v#.#.# - [Detailed description]"`
   - Verify commit was successful

### 📱 Current Status:
- **Current Version**: v1.7.1
- **Next Version**: Will be v1.7.2 for next change
- **Protocol**: CONFIRMED and ready to implement

### 🚨 CRITICAL REMINDERS:
- **NO EXCEPTIONS**: Every single code change requires version increment
- **NO SHORTCUTS**: Always follow complete workflow
- **NO SKIPPING**: Testing is mandatory before committing
- **DETAILED COMMITS**: Always explain what and why in commit messages

---

**I will follow this exact protocol for every single code change going forward!** 🎯

**Ready to proceed with disciplined version management!** ✅