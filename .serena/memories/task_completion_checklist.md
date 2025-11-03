# Task Completion Checklist

When a task is completed, ensure the following steps are taken:

## 1. Code Quality Checks

### Run Linting
```bash
npm run lint
```
- Fix any ESLint errors or warnings
- Ensure code follows project style guidelines

### Run Type Checking
```bash
npm run type-check
```
- Resolve all TypeScript errors
- Ensure proper type definitions are in place

## 2. Testing

### Run Test Suite
```bash
npm test
```
- Ensure all existing tests pass
- Add new tests for new functionality
- Verify test coverage is adequate

### Manual Testing
- Test in browser with development server (`npm run dev`)
- Verify OBS integration if applicable
- Test error handling and edge cases
- Check responsive design on different screen sizes

## 3. Build Verification

### Production Build
```bash
npm run build
```
- Ensure build completes without errors
- Check for any build warnings
- Verify bundle size if performance is a concern

## 4. Documentation

### Update Documentation
- Update CLAUDE.md if architecture changed
- Update component documentation if APIs changed
- Add comments for complex logic
- Update type definitions if data structures changed

### Code Comments
- Ensure complex algorithms are commented
- Document any workarounds or known issues
- Add JSDoc comments for exported functions/components

## 5. Git Workflow

### Commit Changes
```bash
git add .
git commit -m "Descriptive commit message"
```
- Write clear, descriptive commit messages
- Follow conventional commits format if established
- Group related changes in single commits

### Push Changes
```bash
git push
```
- Push to appropriate branch
- Create pull request if using feature branches

## 6. Security Review

### Security Checklist
- [ ] Input validation in place
- [ ] No SQL injection vulnerabilities
- [ ] No XSS vulnerabilities
- [ ] No path traversal issues
- [ ] Sensitive data not exposed in responses
- [ ] API authentication working correctly

## 7. Performance Considerations

### Performance Checks
- [ ] No unnecessary re-renders
- [ ] Database queries optimized
- [ ] Proper error handling prevents memory leaks
- [ ] WebSocket connections properly managed
- [ ] File operations use streams for large files

## 8. Accessibility

### Accessibility Checks
- [ ] Proper contrast ratios maintained
- [ ] Keyboard navigation works
- [ ] Screen reader compatibility
- [ ] Semantic HTML used
- [ ] ARIA labels where appropriate

## 9. OBS Integration Specific

If changes affect OBS integration:
- [ ] Test with actual OBS Studio instance
- [ ] Verify WebSocket connection handling
- [ ] Test text file updates for Source Switcher
- [ ] Verify scene/source creation
- [ ] Test error recovery and reconnection
- [ ] Confirm UUID tracking for groups

## Quick Completion Command

For most tasks, run this sequence:
```bash
npm run lint && npm run type-check && npm test && npm run build
```

If all pass, the code is ready for commit.
