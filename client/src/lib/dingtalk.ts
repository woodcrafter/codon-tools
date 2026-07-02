/**
 * 钉钉OAuth登录前端工具函数
 */

// 从环境变量获取钉钉AppKey（如果未配置则使用占位符）
const DINGTALK_APP_KEY = import.meta.env.VITE_DINGTALK_APP_KEY || 'PLACEHOLDER_APP_KEY';

/**
 * 构造钉钉OAuth登录URL（页面跳转方式）
 */
export function getDingTalkLoginUrl(returnPath: string = '/'): string {
  const state = encodeURIComponent(JSON.stringify({
    returnPath,
    timestamp: Date.now(),
  }));
  
  const redirectUri = `${window.location.origin}/api/oauth/dingtalk/callback`;
  
  const params = new URLSearchParams({
    redirect_uri: redirectUri,
    response_type: 'code',
    client_id: DINGTALK_APP_KEY,
    scope: 'openid corpid',
    state,
    prompt: 'consent',
  });
  
  return `https://login.dingtalk.com/oauth2/auth?${params.toString()}`;
}

/**
 * 初始化钉钉扫码登录（内嵌二维码方式）
 * 
 * @param containerId 包裹容器元素ID（不带#）
 * @param onSuccess 登录成功回调
 * @param onError 登录失败回调
 */
export function initDingTalkQRLogin(
  containerId: string,
  onSuccess?: (result: { redirectUrl: string }) => void,
  onError?: (errorMsg: string) => void
): void {
  // 动态加载钉钉JSSDK
  const script = document.createElement('script');
  script.src = 'https://g.alicdn.com/dingding/h5-dingtalk-login/0.21.0/ddlogin.js';
  script.async = true;
  
  script.onload = () => {
    const state = encodeURIComponent(JSON.stringify({
      returnPath: window.location.pathname,
      timestamp: Date.now(),
    }));
    
    const redirectUri = `${window.location.origin}/api/oauth/dingtalk/callback`;
    
    // 调用钉钉登录方法
    if (typeof (window as any).DTFrameLogin === 'function') {
      (window as any).DTFrameLogin(
        {
          id: containerId,
          width: 300,
          height: 300,
        },
        {
          redirect_uri: encodeURIComponent(redirectUri),
          client_id: DINGTALK_APP_KEY,
          scope: 'openid corpid',
          state,
          prompt: 'consent',
        },
        (result: { redirectUrl: string }) => {
          console.log('[DingTalk] Login successful');
          if (onSuccess) {
            onSuccess(result);
          } else {
            // 默认行为：跳转到回调URL
            window.location.href = result.redirectUrl;
          }
        },
        (errorMsg: string) => {
          console.error('[DingTalk] Login failed:', errorMsg);
          if (onError) {
            onError(errorMsg);
          }
        }
      );
    } else {
      console.error('[DingTalk] DTFrameLogin is not available');
      if (onError) {
        onError('钉钉登录SDK加载失败');
      }
    }
  };
  
  script.onerror = () => {
    console.error('[DingTalk] Failed to load DingTalk SDK');
    if (onError) {
      onError('钉钉登录SDK加载失败');
    }
  };
  
  document.body.appendChild(script);
}

/**
 * 检查是否配置了钉钉OAuth
 */
export function isDingTalkConfigured(): boolean {
  return DINGTALK_APP_KEY !== 'PLACEHOLDER_APP_KEY' && DINGTALK_APP_KEY !== '';
}

/**
 * 获取钉钉配置状态信息
 */
export function getDingTalkConfigStatus(): {
  configured: boolean;
  message: string;
} {
  const configured = isDingTalkConfigured();
  
  if (configured) {
    return {
      configured: true,
      message: '钉钉OAuth已配置',
    };
  }
  
  return {
    configured: false,
    message: '钉钉OAuth未配置，请联系管理员配置后使用',
  };
}
